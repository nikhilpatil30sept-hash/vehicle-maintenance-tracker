package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Fixtures;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import java.util.Map;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

/**
 * One user must never read or change another user's data. The API answers
 * 404 rather than 403 here on purpose: it doesn't confirm that the id exists.
 */
@DisplayName("Data isolation between users")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OwnershipTest extends ApiTest {

    private static Account owner;
    private static Account intruder;
    private static int vehicleId;
    private static int recordId;

    @BeforeAll
    static void ownerCreatesAVehicleWithARecord() {
        owner = Accounts.primary();
        intruder = Accounts.other();
        vehicleId = Fixtures.createVehicle(owner, Fixtures.vehicle("Volvo", "XC60", 2020, 30000));
        recordId = Fixtures.createRecord(owner, Fixtures.record(vehicleId, "2025-04-04", "Oil change", 95, 31000));
    }

    @Test
    @Order(1)
    @DisplayName("Another user's vehicle list doesn't include it")
    void intruderDoesNotSeeTheVehicle() {
        authed(intruder)
                .when().get("/vehicles")
                .then().statusCode(200)
                .body("id", not(hasItem(vehicleId)));
    }

    @Test
    @Order(2)
    @DisplayName("Another user can't list its records")
    void intruderCannotListRecords() {
        authed(intruder)
                .queryParam("vehicle_id", vehicleId)
                .when().get("/records")
                .then().statusCode(404)
                .body("error", equalTo("Vehicle not found"));
    }

    @Test
    @Order(3)
    @DisplayName("Another user can't add a record to it")
    void intruderCannotAddARecord() {
        authed(intruder)
                .body(Fixtures.record(vehicleId, "2025-04-05", "Sneaky entry", 1, 99999))
                .when().post("/records")
                .then().statusCode(404)
                .body("error", equalTo("Vehicle not found"));
    }

    @Test
    @Order(4)
    @DisplayName("Another user can't update or delete the vehicle")
    void intruderCannotChangeTheVehicle() {
        authed(intruder)
                .body(Map.of("make", "Hijacked"))
                .when().put("/vehicles/{id}", vehicleId)
                .then().statusCode(404)
                .body("error", equalTo("Vehicle not found"));

        authed(intruder)
                .when().delete("/vehicles/{id}", vehicleId)
                .then().statusCode(404)
                .body("error", equalTo("Vehicle not found"));
    }

    @Test
    @Order(5)
    @DisplayName("Another user can't update or delete the record")
    void intruderCannotChangeTheRecord() {
        authed(intruder)
                .body(Map.of("cost", 0))
                .when().put("/records/{id}", recordId)
                .then().statusCode(404)
                .body("error", equalTo("Record not found"));

        authed(intruder)
                .when().delete("/records/{id}", recordId)
                .then().statusCode(404)
                .body("error", equalTo("Record not found"));
    }

    @Test
    @Order(6)
    @DisplayName("After all that, the owner's data is unchanged")
    void ownersDataIsUnchanged() {
        authed(owner)
                .when().get("/vehicles")
                .then().statusCode(200)
                .body("find { it.id == %d }.make".formatted(vehicleId), equalTo("Volvo"))
                .body("find { it.id == %d }.current_mileage".formatted(vehicleId), equalTo(31000));

        authed(owner)
                .queryParam("vehicle_id", vehicleId)
                .when().get("/records")
                .then().statusCode(200)
                .body("find { it.id == %d }.cost".formatted(recordId), equalTo(95.0));
    }
}
