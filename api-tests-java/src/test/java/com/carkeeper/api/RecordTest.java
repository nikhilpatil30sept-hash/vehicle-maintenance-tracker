package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Fixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("Service records")
class RecordTest extends ApiTest {

    @Test
    @DisplayName("A record without cost or category gets 0.0 and \"General\"")
    void createsARecordWithDefaults() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Honda", "Fit", 2016, 1000));

        authed(me)
                .body(Fixtures.record(car, "2025-03-14", "Oil change", null, 1200))
                .when().post("/records")
                .then().statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/record.schema.json"))
                .body("date", equalTo("2025-03-14"))
                .body("task", equalTo("Oil change"))
                .body("cost", equalTo(0.0))
                .body("category", equalTo("General"))
                .body("mileage", equalTo(1200))
                .body("receipt_fingerprint", nullValue());
    }

    @Test
    @DisplayName("A cost written like \"$1,234.50\" is stored as 1234.5")
    void parsesFormattedCost() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Honda", "Accord", 2018, 5000));

        authed(me)
                .body(Fixtures.record(car, "2025-04-01", "Brake pads", "$1,234.50", 5100))
                .when().post("/records")
                .then().statusCode(201)
                .body("cost", equalTo(1234.5));
    }

    @Test
    @DisplayName("The odometer only moves forward: a backdated lower reading doesn't lower it")
    void odometerOnlyMovesForward() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Mazda", "CX-5", 2020, 40000));

        Fixtures.createRecord(me, Fixtures.record(car, "2025-05-01", "Tire rotation", 60, 45000));
        assertEquals(45000, Fixtures.currentMileage(me, car));

        Fixtures.createRecord(me, Fixtures.record(car, "2024-01-15", "Old invoice", 90, 30000));
        assertEquals(45000, Fixtures.currentMileage(me, car));
    }

    @Test
    @DisplayName("Editing a reading down recomputes the odometer from the highest remaining record")
    void editingMileageDownRecomputesTheOdometer() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("VW", "Golf", 2019, 40000));
        int typo = Fixtures.createRecord(me, Fixtures.record(car, "2025-06-01", "Inspection", 80, 45000));
        Fixtures.createRecord(me, Fixtures.record(car, "2025-02-01", "Oil change", 70, 42000));

        authed(me)
                .body(Map.of("mileage", 41000))
                .when().put("/records/{id}", typo)
                .then().statusCode(200)
                .body("mileage", equalTo(41000));

        assertEquals(42000, Fixtures.currentMileage(me, car));
    }

    @Test
    @DisplayName("Records are listed newest first")
    void listsNewestFirst() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Nissan", "Leaf", 2021, 10000));
        Fixtures.createRecord(me, Fixtures.record(car, "2024-01-10", "Cabin filter", 40, 10500));
        Fixtures.createRecord(me, Fixtures.record(car, "2025-06-01", "Tires", 600, 20000));
        Fixtures.createRecord(me, Fixtures.record(car, "2024-12-31", "Wipers", 25, 15000));

        List<String> dates = authed(me)
                .queryParam("vehicle_id", car)
                .when().get("/records")
                .then().statusCode(200)
                .extract().path("date");

        assertEquals(List.of("2025-06-01", "2024-12-31", "2024-01-10"), dates);
    }

    @ParameterizedTest(name = "{0} = {1}")
    @MethodSource("invalidFields")
    @DisplayName("Invalid input is refused with a 400 that names the field")
    void invalidInputIsRefused(String field, Object value, String messageStart) {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Toyota", "Prius", 2015, 100000));
        Map<String, Object> body = Fixtures.record(car, "2025-01-20", "Oil change", 75, 101000);
        if (value == null) {
            body.remove(field);
        } else {
            body.put(field, value);
        }

        authed(me)
                .body(body)
                .when().post("/records")
                .then().statusCode(400)
                .body(matchesJsonSchemaInClasspath("schemas/error.schema.json"))
                .body("field", equalTo(field))
                .body("error", startsWith(messageStart));
    }

    static Stream<Arguments> invalidFields() {
        // Two days ahead, so a time-zone gap between this machine and the API can't make it "today".
        String future = LocalDate.now().plusDays(2).toString();
        return Stream.of(
                Arguments.of("date", future, "Date cannot be in the future"),
                Arguments.of("date", "2025/01/20", "Date must be in YYYY-MM-DD format"),
                Arguments.of("date", "1899-12-31", "Date is unrealistically old"),
                Arguments.of("task", null, "Task is required"),
                Arguments.of("cost", "NaN", "Cost must be a number"),
                Arguments.of("cost", -5, "Cost must be between"),
                Arguments.of("mileage", "abc", "Mileage must be a number"),
                Arguments.of("vehicle_id", null, "Vehicle id is required"));
    }

    @ParameterizedTest(name = "vehicle_id={0}")
    @CsvSource({
            "abc, Vehicle id must be a number",
            "0, Vehicle id must be a positive number"
    })
    @DisplayName("A bad vehicle_id in the query string is a 400, not a 500")
    void badVehicleIdQueryIsRefused(String vehicleId, String message) {
        authed(Accounts.primary())
                .queryParam("vehicle_id", vehicleId)
                .when().get("/records")
                .then().statusCode(400)
                .body("error", equalTo(message));
    }

    @Test
    @DisplayName("Listing records without a vehicle_id is a 400")
    void listingNeedsAVehicleId() {
        authed(Accounts.primary())
                .when().get("/records")
                .then().statusCode(400)
                .body("error", equalTo("Vehicle id is required"));
    }

    @Test
    @DisplayName("A deleted record disappears from the list")
    void deletedRecordIsGone() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Chevrolet", "Bolt", 2020, 30000));
        int rec = Fixtures.createRecord(me, Fixtures.record(car, "2025-03-03", "Battery check", 0, 30500));

        authed(me)
                .when().delete("/records/{id}", rec)
                .then().statusCode(200)
                .body("msg", equalTo("Deleted"));

        authed(me)
                .queryParam("vehicle_id", car)
                .when().get("/records")
                .then().statusCode(200)
                .body("id", not(hasItem(rec)));
    }

    @Test
    @DisplayName("Deleting a vehicle deletes its records too")
    void deletingAVehicleDeletesItsRecords() {
        Account me = Accounts.primary();
        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Jeep", "Wrangler", 2018, 70000));
        int rec = Fixtures.createRecord(me, Fixtures.record(car, "2025-02-02", "Alignment", 110, 71000));

        authed(me).when().delete("/vehicles/{id}", car).then().statusCode(200);

        authed(me)
                .body(Map.of("task", "Still here?"))
                .when().put("/records/{id}", rec)
                .then().statusCode(404)
                .body("error", equalTo("Record not found"));
    }
}
