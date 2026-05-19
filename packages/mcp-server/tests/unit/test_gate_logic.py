from __future__ import annotations

from kicad_mcp.tools.validation import GateOutcome, _combined_status, _project_gate_report_payload


def test_gate_logic_prefers_blocked_then_fail_then_pass() -> None:
    assert _combined_status([GateOutcome("Schematic", "PASS", "ok")]) == "PASS"
    assert _combined_status([GateOutcome("PCB", "FAIL", "fix")]) == "FAIL"
    assert (
        _combined_status(
            [
                GateOutcome("PCB", "FAIL", "fix"),
                GateOutcome("Manufacturing", "BLOCKED", "blocked"),
            ]
        )
        == "BLOCKED"
    )


def test_project_gate_payload_renders_summary() -> None:
    payload = _project_gate_report_payload(
        [
            GateOutcome("Schematic", "PASS", "Ready"),
            GateOutcome("PCB", "FAIL", "Clearance issues", ["Too close"]),
        ]
    )
    assert payload.status == "FAIL"
    assert "Project quality gate: FAIL" in payload.text
    assert payload.outcomes[1].details == ["Too close"]
