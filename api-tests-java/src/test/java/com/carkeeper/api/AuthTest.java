package com.carkeeper.api;

import com.carkeeper.api.support.Account;
import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.Map;
import java.util.stream.Stream;

import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.junit.jupiter.api.Assertions.assertEquals;

@DisplayName("Registration and login")
class AuthTest extends ApiTest {

    @Test
    @DisplayName("Registering a new account answers 201")
    void registersANewAccount() {
        anonymous()
                .body(Map.of("email", Accounts.uniqueEmail("register"), "password", Accounts.PASSWORD))
                .when().post("/register")
                .then().statusCode(201)
                .body("msg", equalTo("Success"));
    }

    @Test
    @DisplayName("A duplicate email is refused with the same generic message, even in different case")
    void duplicateEmailIsRefusedGenerically() {
        String email = Accounts.uniqueEmail("duplicate");
        Accounts.register(email, Accounts.PASSWORD);

        // Same address, upper-cased and padded: the API normalises it before the check.
        anonymous()
                .body(Map.of("email", "  " + email.toUpperCase() + " ", "password", Accounts.PASSWORD))
                .when().post("/register")
                .then().statusCode(400)
                .body("error", equalTo("Registration failed"));
    }

    @ParameterizedTest(name = "invalid email #{index}")
    @MethodSource("invalidEmails")
    @DisplayName("Invalid email addresses are refused")
    void invalidEmailIsRefused(String email) {
        anonymous()
                .body(Map.of("email", email, "password", Accounts.PASSWORD))
                .when().post("/register")
                .then().statusCode(400)
                .body("error", equalTo("A valid email is required"));
    }

    static Stream<String> invalidEmails() {
        return Stream.of("", "not-an-email", "a".repeat(250) + "@example.com");
    }

    @ParameterizedTest(name = "{0}-character password")
    @CsvSource({
            "7, Password must be at least 8 characters",
            "129, Password must be at most 128 characters"
    })
    @DisplayName("Password length limits are enforced")
    void passwordLengthIsEnforced(int length, String message) {
        anonymous()
                .body(Map.of("email", Accounts.uniqueEmail("password"), "password", "p".repeat(length)))
                .when().post("/register")
                .then().statusCode(400)
                .body("error", equalTo(message));
    }

    @Test
    @DisplayName("A JSON body that isn't an object is refused")
    void nonObjectBodyIsRefused() {
        anonymous()
                .body("[]")
                .when().post("/register")
                .then().statusCode(400)
                .body("error", equalTo("Request body must be a JSON object"));
    }

    @Test
    @DisplayName("Logging in returns a JWT and the normalised email")
    void logInReturnsATokenAndTheNormalisedEmail() {
        String email = Accounts.uniqueEmail("login");
        Accounts.register(email, Accounts.PASSWORD);

        anonymous()
                .body(Map.of("email", "  " + email.toUpperCase(), "password", Accounts.PASSWORD))
                .when().post("/login")
                .then().statusCode(200)
                .body("token", matchesPattern("^[\\w-]+\\.[\\w-]+\\.[\\w-]+$"))
                .body("user.email", equalTo(email));
    }

    @Test
    @DisplayName("A wrong password and an unknown email get the same answer, so accounts can't be discovered")
    void loginFailuresDontRevealWhichAccountsExist() {
        Account existing = Accounts.primary();

        String wrongPassword = anonymous()
                .body(Map.of("email", existing.email(), "password", "not-the-password"))
                .when().post("/login")
                .then().statusCode(401)
                .extract().path("error");

        String unknownEmail = anonymous()
                .body(Map.of("email", Accounts.uniqueEmail("nobody"), "password", Accounts.PASSWORD))
                .when().post("/login")
                .then().statusCode(401)
                .extract().path("error");

        assertEquals("Invalid credentials", wrongPassword);
        assertEquals(wrongPassword, unknownEmail);
    }
}
