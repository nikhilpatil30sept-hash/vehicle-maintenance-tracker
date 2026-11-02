package com.carkeeper.api.support;

import java.util.HashMap;
import java.util.Map;

/** Request bodies and create-helpers for vehicles and service records. */
public final class Fixtures {

    private Fixtures() {
    }

    /** A valid vehicle body. Mutable, so a test can break one field. */
    public static Map<String, Object> vehicle(String make, String model, int year, int mileage) {
        Map<String, Object> body = new HashMap<>();
        body.put("make", make);
        body.put("model", model);
        body.put("year", year);
        body.put("current_mileage", mileage);
        return body;
    }

    /** A valid service-record body. Mutable, so a test can break one field. */
    public static Map<String, Object> record(int vehicleId, String date, String task, Object cost, int mileage) {
        Map<String, Object> body = new HashMap<>();
        body.put("vehicle_id", vehicleId);
        body.put("date", date);
        body.put("task", task);
        if (cost != null) {
            body.put("cost", cost);
        }
        body.put("mileage", mileage);
        return body;
    }

    public static int createVehicle(Account owner, Map<String, Object> body) {
        return ApiTest.authed(owner)
                .body(body)
                .when().post("/vehicles")
                .then().statusCode(201)
                .extract().path("id");
    }

    public static int createRecord(Account owner, Map<String, Object> body) {
        return ApiTest.authed(owner)
                .body(body)
                .when().post("/records")
                .then().statusCode(201)
                .extract().path("id");
    }

    /** The vehicle's current odometer reading, as GET /vehicles reports it. */
    public static int currentMileage(Account owner, int vehicleId) {
        return ApiTest.authed(owner)
                .when().get("/vehicles")
                .then().statusCode(200)
                .extract().path("find { it.id == %d }.current_mileage".formatted(vehicleId));
    }
}
