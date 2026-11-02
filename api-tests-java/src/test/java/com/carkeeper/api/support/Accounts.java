package com.carkeeper.api.support;

import io.restassured.path.json.JsonPath;

import java.util.Map;
import java.util.UUID;

/**
 * Creates test users through the real /register and /login endpoints.
 *
 * The API allows 10 login attempts per client address every 5 minutes, so the
 * suite shares two long-lived accounts instead of logging in for every test.
 * The whole run stays at about 6 logins.
 */
public final class Accounts {

    public static final String PASSWORD = "correct-horse-battery-9";

    private static Account primary;
    private static Account other;

    private Accounts() {
    }

    /** The main test user, shared across test classes. */
    public static synchronized Account primary() {
        if (primary == null) {
            primary = createAndLogIn("primary");
        }
        return primary;
    }

    /** A second user, for checking that one user can't reach another's data. */
    public static synchronized Account other() {
        if (other == null) {
            other = createAndLogIn("other");
        }
        return other;
    }

    /** A fresh, unique address, so runs never collide with earlier data. */
    public static String uniqueEmail(String label) {
        return "java-" + label + "-" + UUID.randomUUID().toString().substring(0, 12) + "@example.com";
    }

    public static void register(String email, String password) {
        ApiTest.anonymous()
                .body(Map.of("email", email, "password", password))
                .when().post("/register")
                .then().statusCode(201);
    }

    public static Account logIn(String email, String password) {
        JsonPath body = ApiTest.anonymous()
                .body(Map.of("email", email, "password", password))
                .when().post("/login")
                .then().statusCode(200)
                .extract().jsonPath();
        return new Account(body.getInt("user.id"), email, password, body.getString("token"));
    }

    public static Account createAndLogIn(String label) {
        String email = uniqueEmail(label);
        register(email, PASSWORD);
        return logIn(email, PASSWORD);
    }
}
