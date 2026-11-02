package com.carkeeper.api.support;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

/**
 * Signs HS256 JSON Web Tokens with the JDK alone, so tests can send tokens the
 * API never issued: expired ones, or ones signed with the wrong key.
 */
public final class Jwt {

    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    private Jwt() {
    }

    /** The SECRET_KEY the API under test signs with (see pom.xml). */
    public static String apiSecret() {
        return System.getProperty("jwtSecret", "local-docker-secret-change-me");
    }

    /** Claims in the shape the API issues: {"user_id": ..., "iat": ..., "exp": ...}. */
    public static String claims(int userId, long issuedAtEpochSeconds, long expiresAtEpochSeconds) {
        return "{\"user_id\":" + userId
                + ",\"iat\":" + issuedAtEpochSeconds
                + ",\"exp\":" + expiresAtEpochSeconds + "}";
    }

    public static String hs256(String claimsJson, String secret) {
        String header = encode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        String payload = encode(claimsJson);
        String signingInput = header + "." + payload;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] signature = mac.doFinal(signingInput.getBytes(StandardCharsets.UTF_8));
            return signingInput + "." + URL.encodeToString(signature);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Could not sign the test token", e);
        }
    }

    private static String encode(String json) {
        return URL.encodeToString(json.getBytes(StandardCharsets.UTF_8));
    }
}
