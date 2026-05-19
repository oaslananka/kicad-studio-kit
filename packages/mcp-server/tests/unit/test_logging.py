from __future__ import annotations

from kicad_mcp.utils.logging import redact_sensitive_keys


def test_redact_sensitive_keys_masks_secret_like_fields() -> None:
    payload = redact_sensitive_keys(
        None,  # type: ignore[arg-type]
        "info",
        {
            "event": "startup",
            "auth_token": "abc",
            "apiKey": "xyz",
            "password_hint": "nope",
            "safe": "ok",
        },
    )

    assert payload["event"] == "startup"
    assert payload["safe"] == "ok"
    assert payload["auth_token"] == "***REDACTED***"  # noqa: S105 - redaction sentinel
    assert payload["apiKey"] == "***REDACTED***"  # noqa: S105 - redaction sentinel
    assert payload["password_hint"] == "***REDACTED***"  # noqa: S105 - redaction sentinel
