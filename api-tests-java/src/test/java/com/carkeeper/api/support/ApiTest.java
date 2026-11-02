package com.carkeeper.api.support;

import io.restassured.RestAssured;
import io.restassured.config.JsonConfig;
import io.restassured.config.RestAssuredConfig;
import io.restassured.http.ContentType;
import io.restassured.path.json.config.JsonPathConfig;
import io.restassured.specification.RequestSpecification;

import static io.restassured.RestAssured.given;

/**
 * Base class for every test: points REST Assured at the API under test and
 * gives two ways to start a request, with or without a logged-in account.
 */
public abstract class ApiTest {

    static {
        RestAssured.baseURI = System.getProperty("baseUrl", "http://localhost:5001");
        // Read JSON decimals (cost, total_cost) as Double, so they compare
        // cleanly with Hamcrest's equalTo(120.5).
        RestAssured.config = RestAssuredConfig.config().jsonConfig(
                JsonConfig.jsonConfig().numberReturnType(JsonPathConfig.NumberReturnType.DOUBLE));
        // Print the full request and response only when a test fails.
        RestAssured.enableLoggingOfRequestAndResponseIfValidationFails();
    }

    /** A JSON request with no Authorization header. */
    protected static RequestSpecification anonymous() {
        return given().contentType(ContentType.JSON).accept(ContentType.JSON);
    }

    /** A JSON request carrying the account's bearer token. */
    protected static RequestSpecification authed(Account account) {
        return anonymous().header("Authorization", "Bearer " + account.token());
    }
}
