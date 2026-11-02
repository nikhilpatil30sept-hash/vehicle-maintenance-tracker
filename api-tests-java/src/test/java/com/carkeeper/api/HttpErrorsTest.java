package com.carkeeper.api;

import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Accounts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;

/**
 * Found by this suite: the API's catch-all error handler used to turn Flask's
 * own 404 and 405 responses into "500 An unexpected error occurred", which
 * hides client mistakes as server failures. These pin the correct codes.
 */
@DisplayName("HTTP errors keep their status codes")
class HttpErrorsTest extends ApiTest {

    @Test
    @DisplayName("An unknown route answers 404, not 500")
    void unknownRouteIsNotFound() {
        anonymous()
                .when().get("/does-not-exist")
                .then().statusCode(404)
                .body("error", equalTo("Not Found"));
    }

    @Test
    @DisplayName("A non-numeric vehicle id in the URL answers 404, not 500")
    void nonNumericIdIsNotFound() {
        authed(Accounts.primary())
                .when().put("/vehicles/abc")
                .then().statusCode(404)
                .body("error", equalTo("Not Found"));
    }

    @Test
    @DisplayName("A wrong HTTP method answers 405, not 500")
    void wrongMethodIsNotAllowed() {
        anonymous()
                .when().delete("/health")
                .then().statusCode(405)
                .body("error", equalTo("Method Not Allowed"));
    }
}
