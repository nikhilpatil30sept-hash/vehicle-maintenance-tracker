package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Fixtures;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static io.restassured.module.jsv.JsonSchemaValidator.matchesJsonSchemaInClasspath;
import static org.hamcrest.Matchers.equalTo;

@DisplayName("Spend summary")
class SummaryTest extends ApiTest {

    @Test
    @DisplayName("The summary counts only this user's vehicles and adds up only their costs")
    void summaryAddsUpThisUsersCosts() {
        // A fresh account, so data from other tests can't change the totals.
        Account me = Accounts.createAndLogIn("summary");

        authed(me)
                .when().get("/summary")
                .then().statusCode(200)
                .body(matchesJsonSchemaInClasspath("schemas/summary.schema.json"))
                .body("vehicle_count", equalTo(0))
                .body("total_cost", equalTo(0.0));

        int car = Fixtures.createVehicle(me, Fixtures.vehicle("Honda", "CR-V", 2021, 20000));
        int van = Fixtures.createVehicle(me, Fixtures.vehicle("Toyota", "Sienna", 2019, 50000));
        Fixtures.createRecord(me, Fixtures.record(car, "2025-05-05", "Oil change", 120.0, 21000));
        Fixtures.createRecord(me, Fixtures.record(van, "2025-05-06", "Wipers", 80.5, 50500));

        authed(me)
                .when().get("/summary")
                .then().statusCode(200)
                .body("vehicle_count", equalTo(2))
                .body("total_cost", equalTo(200.5));
    }
}
