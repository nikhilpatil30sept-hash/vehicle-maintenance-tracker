package com.carkeeper.api;

import com.carkeeper.api.support.Accounts;
import com.carkeeper.api.support.ApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assumptions.assumeFalse;

/**
 * Receipt scanning calls Google Gemini, so a live run only checks the guard for
 * a server with no API key. The pytest suite covers the rest with the AI call mocked.
 */
@DisplayName("Receipt scanning")
class OcrTest extends ApiTest {

    @Test
    @DisplayName("Without a Gemini key the endpoint answers 503 instead of failing")
    void unconfiguredOcrAnswers503() {
        assumeFalse(Boolean.getBoolean("ocrConfigured"),
                "Skipped: this API instance has a Gemini key (-DocrConfigured=true)");

        authed(Accounts.primary())
                .body(Map.of("image", "aGVsbG8=", "mime_type", "image/png"))
                .when().post("/api/ocr")
                .then().statusCode(503)
                .body("error", equalTo("OCR is not configured"));
    }
}
