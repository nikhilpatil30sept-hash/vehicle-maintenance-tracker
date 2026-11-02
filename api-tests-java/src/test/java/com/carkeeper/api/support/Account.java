package com.carkeeper.api.support;

/** A registered, logged-in user of the API. */
public record Account(int id, String email, String password, String token) {
}
