package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import com.carkeeper.api.support.Jwt;
import io.restassured.http.Method;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Instant;
import java.util.stream.Stream;

import static org.hamcrest.Matchers.equalTo;

@DisplayName("Token checks on protected endpoints")
class AuthGuardTest extends ApiTest {

    static Stream<Arguments> protectedEndpoints() {
        return Stream.of(
                Arguments.of(Method.GET, "/vehicles"),
                Arguments.of(Method.POST, "/vehicles"),
                Arguments.of(Method.PUT, "/vehicles/1"),
                Arguments.of(Method.DELETE, "/vehicles/1"),
                Arguments.of(Method.GET, "/records?vehicle_id=1"),
                Arguments.of(Method.POST, "/records"),
                Arguments.of(Method.PUT, "/records/1"),
                Arguments.of(Method.DELETE, "/records/1"),
                Arguments.of(Method.GET, "/summary"),
                Arguments.of(Method.POST, "/api/ocr"));
    }

    @ParameterizedTest(name = "{0} {1}")
    @MethodSource("protectedEndpoints")
    @DisplayName("Every protected endpoint refuses a request with no token")
    void everyProtectedEndpointNeedsAToken(Method method, String path) {
        RequestSpecification request = anonymous();
        if (method == Method.POST || method == Method.PUT) {
            request.body("{}");
        }
        request.when().request(method, path)
                .then().statusCode(401)
                .body("error", equalTo("Missing or invalid authorization header"));
    }

    @Test
    @DisplayName("A non-Bearer scheme is refused")
    void nonBearerSchemeIsRefused() {
        anonymous()
                .header("Authorization", "Basic dXNlcjpwYXNzd29yZA==")
                .when().get("/vehicles")
                .then().statusCode(401)
                .body("error", equalTo("Missing or invalid authorization header"));
    }

    @Test
    @DisplayName("A malformed token is refused")
    void malformedTokenIsRefused() {
        anonymous()
                .header("Authorization", "Bearer not-a-jwt")
                .when().get("/vehicles")
                .then().statusCode(401)
                .body("error", equalTo("Invalid authentication token"));
    }

    @Test
    @DisplayName("A token we sign with the API's own key is accepted (control for the two tests below)")
    void selfSignedTokenWithTheRightKeyIsAccepted() {
        long now = Instant.now().getEpochSecond();
        String token = Jwt.hs256(Jwt.claims(Accounts.primary().id(), now, now + 600), Jwt.apiSecret());
        withBearer(token)
                .when().get("/vehicles")
                .then().statusCode(200);
    }

    @Test
    @DisplayName("A token signed with another key is refused")
    void tokenSignedWithAnotherKeyIsRefused() {
        long now = Instant.now().getEpochSecond();
        String token = Jwt.hs256(Jwt.claims(Accounts.primary().id(), now, now + 600),
                "not-the-api-secret-0123456789abcdef");
        withBearer(token)
                .when().get("/vehicles")
                .then().statusCode(401)
                .body("error", equalTo("Invalid authentication token"));
    }

    @Test
    @DisplayName("An expired token gets the session-expired message")
    void expiredTokenIsRefusedWithASessionMessage() {
        long now = Instant.now().getEpochSecond();
        String token = Jwt.hs256(Jwt.claims(Accounts.primary().id(), now - 7200, now - 3600), Jwt.apiSecret());
        withBearer(token)
                .when().get("/vehicles")
                .then().statusCode(401)
                .body("error", equalTo("Session expired, please log in again"));
    }

    @Test
    @DisplayName("A real login token is accepted")
    void loginTokenIsAccepted() {
        Account me = Accounts.primary();
        authed(me)
                .when().get("/vehicles")
                .then().statusCode(200);
    }

    private static RequestSpecification withBearer(String token) {
        return anonymous().header("Authorization", "Bearer " + token);
    }
}
