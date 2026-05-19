from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from kicad_mcp.connection import KiCadConnectionError
from kicad_mcp.diagnostics import (
    CheckResult,
    ConfigDiagnostics,
    DiagnosticReport,
    KiCadDiagnostics,
    McpDiagnostics,
)
from kicad_mcp.server import app


def _diagnostic_report(checks: list[CheckResult]) -> DiagnosticReport:
    return DiagnosticReport(
        ok=not any(check.status == "error" for check in checks),
        status="error"
        if any(check.status == "error" for check in checks)
        else "degraded"
        if any(check.status == "warn" for check in checks)
        else "ok",
        mcp=McpDiagnostics(transport_default="stdio", profile="agent_full"),
        kicad=KiCadDiagnostics(cli_path=None, cli_found=False),
        config=ConfigDiagnostics(
            workspace_root=None,
            project_dir=None,
            output_dir=None,
            timeout_ms=5000,
            retries=2,
            headless=True,
            log_level="INFO",
            log_format="console",
            transport="stdio",
            auth_token={"configured": False},
            kicad_token={"configured": False},
        ),
        checks=checks,
    )


def test_cli_health_json_does_not_require_kicad(sample_project: Path) -> None:
    _ = sample_project
    result = CliRunner().invoke(app, ["health", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["ok"] is True
    assert payload["package"]["name"] == "kicad-mcp-pro"
    assert payload["kicad"]["ipc_reachable"] is False
    assert payload["checks"][-1]["name"] == "kicad_ipc"
    assert payload["checks"][-1]["status"] == "skipped"


def test_cli_doctor_json_reports_unavailable_kicad_without_stack_trace(
    sample_project: Path,
    monkeypatch,
) -> None:
    _ = sample_project
    monkeypatch.setattr("kicad_mcp.diagnostics.find_kicad_version", lambda _path: "KiCad 10.0.1")
    monkeypatch.setattr(
        "kicad_mcp.diagnostics.get_board",
        lambda: (_ for _ in ()).throw(KiCadConnectionError("IPC not reachable")),
    )

    result = CliRunner().invoke(app, ["doctor", "--json"])

    assert result.exit_code == 0, result.output
    assert "Traceback" not in result.output
    payload = json.loads(result.output)
    assert payload["status"] == "degraded"
    assert payload["kicad"]["version"] == "KiCad 10.0.1"
    assert any(check["name"] == "kicad_ipc" for check in payload["checks"])


def test_cli_version_and_serve_help(sample_project: Path) -> None:
    _ = sample_project
    runner = CliRunner()

    version = runner.invoke(app, ["version", "--json"])
    serve_help = runner.invoke(app, ["serve", "--help"])

    assert version.exit_code == 0, version.output
    assert json.loads(version.output)["package"]["version"]
    assert serve_help.exit_code == 0, serve_help.output
    assert "Start the MCP server explicitly" in serve_help.output


def test_cli_tools_list_json(sample_project: Path) -> None:
    _ = sample_project

    result = CliRunner().invoke(app, ["tools", "list", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    names = {tool["name"] for tool in payload}
    assert "kicad_set_project" in names
    assert all("inputSchema" in tool for tool in payload)


def test_cli_capabilities_json(sample_project: Path) -> None:
    _ = sample_project

    result = CliRunner().invoke(app, ["capabilities", "--json"])

    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    by_name = {record["name"]: record for record in payload}
    assert by_name["export_manufacturing_package"]["human_gate_required"] is True
    assert by_name["kicad_health"]["verification_level"] == "verified"


def test_cli_mcp_config_generator_outputs_supported_clients(sample_project: Path) -> None:
    _ = sample_project
    runner = CliRunner()

    claude = runner.invoke(app, ["mcp-config", "generate", "--client", "claude"])
    codex = runner.invoke(app, ["mcp-config", "generate", "--client", "codex"])

    assert claude.exit_code == 0, claude.output
    assert json.loads(claude.output)["mcpServers"]["kicad-mcp-pro"]["command"] == "uvx"
    assert codex.exit_code == 0, codex.output
    assert "[mcp_servers.kicad-mcp-pro]" in codex.output
    assert 'args = ["kicad-mcp-pro"]' in codex.output


def test_cli_doctor_strict_exit_codes(monkeypatch) -> None:
    runner = CliRunner()

    monkeypatch.setattr(
        "kicad_mcp.server.build_doctor_report",
        lambda: _diagnostic_report(
            [CheckResult(name="kicad_ipc", status="warn", message="IPC not reachable")]
        ),
    )
    degraded = runner.invoke(app, ["doctor", "--json", "--strict"])
    assert degraded.exit_code == 1, degraded.output

    monkeypatch.setattr(
        "kicad_mcp.server.build_doctor_report",
        lambda: _diagnostic_report(
            [CheckResult(name="kicad_cli", status="warn", message="kicad-cli missing")]
        ),
    )
    missing_external = runner.invoke(app, ["doctor", "--json", "--strict"])
    assert missing_external.exit_code == 3, missing_external.output
