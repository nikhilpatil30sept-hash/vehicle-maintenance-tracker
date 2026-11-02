package com.carkeeper.api;

import com.carkeeper.api.support.ApiTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.equalTo;

@DisplayName("Health check")
class HealthTest extends ApiTest {

    @Test
    @DisplayName("GET /health answers 200 with JSON and needs no token")
    void healthIsPublic() {
        anonymous()
                .when().get("/health")
                .then().statusCode(200)
                .contentType(ContentType.JSON)
                .body("status", equalTo("ok"));
    }
}
