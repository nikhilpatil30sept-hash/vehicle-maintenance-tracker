package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Fixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("Vehicles")
class VehicleTest extends ApiTest {

    @Test
    @DisplayName("Creating a vehicle answers 201 with a body that matches the schema")
    void createsAVehicle() {
        authed(Accounts.primary())
                .body(Fixtures.vehicle("Honda", "Civic", 2019, 42000))
                .when().post("/vehicles")
                .then().statusCode(201)
                .body(matchesJsonSchemaInClasspath("schemas/vehicle.schema.json"))
                .body("make", equalTo("Honda"))
                .body("model", equalTo("Civic"))
                .body("year", equalTo(2019))
                .body("current_mileage", equalTo(42000))
                .body("license_plate", equalTo(""));
    }

    @Test
    @DisplayName("Text is trimmed and formatted mileage like \"12,345\" is accepted")
    void trimsTextAndParsesFormattedMileage() {
        Map<String, Object> body = Fixtures.vehicle("  Toyota  ", " Corolla ", 2020, 0);
        body.put("current_mileage", "12,345");
        body.put("license_plate", " ABCD 123 ");

        authed(Accounts.primary())
                .body(body)
                .when().post("/vehicles")
                .then().statusCode(201)
                .body("make", equalTo("Toyota"))
                .body("model", equalTo("Corolla"))
                .body("current_mileage", equalTo(12345))
                .body("license_plate", equalTo("ABCD 123"));
    }

    @ParameterizedTest(name = "{0} = {1}")
    @MethodSource("invalidFields")
    @DisplayName("Invalid input is refused with a 400 that names the field")
    void invalidInputIsRefused(String field, Object value, String messageStart) {
        Map<String, Object> body = Fixtures.vehicle("Mazda", "3", 2018, 10000);
        if (value == null) {
            body.remove(field);
        } else {
            body.put(field, value);
        }

        authed(Accounts.primary())
                .body(body)
                .when().post("/vehicles")
                .then().statusCode(400)
                .body(matchesJsonSchemaInClasspath("schemas/error.schema.json"))
                .body("field", equalTo(field))
                .body("error", startsWith(messageStart));
    }

    static Stream<Arguments> invalidFields() {
        return Stream.of(
                Arguments.of("make", null, "Make is required"),
                Arguments.of("make", "   ", "Make is required"),
                Arguments.of("make", "x".repeat(81), "Make must be 80 characters or fewer"),
                Arguments.of("year", 1884, "Year must be between 1885 and"),
                Arguments.of("year", 3000, "Year must be between 1885 and"),
                Arguments.of("year", "abc", "Year must be a number"),
                Arguments.of("year", true, "Year must be a number"),
                Arguments.of("current_mileage", -1, "Current mileage must be between 0 and 10000000"),
                Arguments.of("license_plate", "x".repeat(21), "License plate must be 20 characters or fewer"));
    }

    @Test
    @DisplayName("A partial update changes only the fields that were sent")
    void partialUpdateKeepsOtherFields() {
        Account me = Accounts.primary();
        int id = Fixtures.createVehicle(me, Fixtures.vehicle("Ford", "Focus", 2015, 90000));

        authed(me)
                .body(Map.of("current_mileage", 95000))
                .when().put("/vehicles/{id}", id)
                .then().statusCode(200)
                .body("current_mileage", equalTo(95000))
                .body("make", equalTo("Ford"))
                .body("model", equalTo("Focus"))
                .body("year", equalTo(2015));
    }

    @Test
    @DisplayName("A deleted vehicle is gone from the list and can't be updated")
    void deletedVehicleIsGone() {
        Account me = Accounts.primary();
        int id = Fixtures.createVehicle(me, Fixtures.vehicle("Kia", "Soul", 2017, 60000));

        authed(me)
                .when().delete("/vehicles/{id}", id)
                .then().statusCode(200)
                .body("msg", equalTo("Deleted"));

        authed(me)
                .when().get("/vehicles")
                .then().statusCode(200)
                .body("id", not(hasItem(id)));

        authed(me)
                .body(Map.of("make", "Kia"))
                .when().put("/vehicles/{id}", id)
                .then().statusCode(404)
                .body("error", equalTo("Vehicle not found"));
    }

    @Test
    @DisplayName("The vehicle list comes back in creation order")
    void listIsOrderedById() {
        Account me = Accounts.primary();
        Fixtures.createVehicle(me, Fixtures.vehicle("Subaru", "Outback", 2021, 15000));
        Fixtures.createVehicle(me, Fixtures.vehicle("Hyundai", "Elantra", 2022, 8000));

        List<Integer> ids = authed(me)
                .when().get("/vehicles")
                .then().statusCode(200)
                .extract().path("id");

        assertEquals(ids.stream().sorted().toList(), ids);
    }
}
