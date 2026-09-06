#!/usr/bin/env python3
"""Stand-in for the Gemini API, used only by the k6 load test job.

Returns a fixed, Gemini-response-shaped payload for every request, so the
/api/ocr load-test traffic never leaves the CI runner and never touches a
real GEMINI_API_KEY or API quota. app.py is pointed here via GEMINI_API_BASE
(see the GEMINI_API_BASE constant in app.py) rather than the real
generativelanguage.googleapis.com.

Threaded so it doesn't itself become the bottleneck under the OCR scenario's
concurrent VUs.
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CANNED_TEXT = json.dumps(
    {"date": "2024-01-01", "items": [{"description": "Oil change", "amount": 49.99}]}
)

RESPONSE_BODY = json.dumps(
    {"candidates": [{"content": {"parts": [{"text": CANNED_TEXT}]}}]}
).encode()


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Drain the request body before responding - app.py's requests.post
        # call sends one, and leaving it unread can wedge the connection
        # under concurrent load.
        length = int(self.headers.get("Content-Length", 0))
        if length:
            self.rfile.read(length)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(RESPONSE_BODY)))
        self.end_headers()
        self.wfile.write(RESPONSE_BODY)

    def log_message(self, *args):
        pass  # every response is identical and canned - nothing here to debug


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8090))
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
