from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from kicad_mcp.connection import KiCadConnectionError
from kicad_mcp.discovery import CliCapabilities
from kicad_mcp.server import create_server
from kicad_mcp.server_info import get_server_info_contract
from tests.conftest import call_tool_payload

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "protocol-schemas"
    / "schemas"
    / "kicad-mcp-server-info.schema.json"
)


def _validate_contract(payload: dict[str, object]) -> None:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(payload)


def test_server_info_contract_matches_protocol_schema(monkeypatch, sample_project) -> None:
    _ = sample_project
    monkeypatch.setenv("KICAD_MCP_TRANSPORT", "http")
    monkeypatch.setenv("KICAD_MCP_STATEFUL_HTTP", "true")
    monkeypatch.setenv("KICAD_MCP_AUTH_TOKEN", "local-test-token-with-enough-entropy")
    monkeypatch.setattr("kicad_mcp.server_info.find_kicad_version", lambda _cli: "KiCad 10.0.3")
    monkeypatch.setattr(
        "kicad_mcp.server_info.get_cli_capabilities",
        lambda _cli: CliCapabilities(
            version="KiCad 10.0.3",
            supports_ipc2581=True,
            supports_odb_export=True,
            supports_svg=True,
            supports_dxf=True,
            supports_step=True,
            supports_render=True,
            supports_spice_netlist=True,
        ),
    )
    monkeypatch.setattr("kicad_mcp.server_info.get_board", lambda: object())

    payload = get_server_info_contract()

    _validate_contract(payload)
    assert payload["schemaVersion"] == "1.0.0"
    assert payload["server"] == "kicad-mcp-pro"
    assert payload["mcpProtocolVersion"] == "2025-11-25"
    assert payload["toolSchemaVersion"] == "1.0.0"
    assert payload["compatibilityRange"] == {
        "kicadStudio": {
            "required": ">=1.0.0 <2.0.0",
            "recommended": ">=1.0.0 <2.0.0",
            "testedAgainst": "1.0.0",
        },
        "kicadMcpPro": {
            "required": ">=1.0.0 <2.0.0",
            "testedAgainst": "1.0.0",
        },
    }
    assert payload["transport"] == {
        "type": "streamable-http",
        "streamableHttp": True,
        "statelessHttp": False,
        "legacySse": False,
        "authRequired": True,
        "endpoint": "http://127.0.0.1:3334/mcp",
    }
    assert payload["kicad"] == {
        "cliFound": True,
        "cliPath": str(sample_project.parent / "kicad-cli"),
        "cliVersion": "KiCad 10.0.3",
        "ipcAvailable": True,
        "livePcbContext": True,
    }
    assert payload["capabilities"] == {
        "fileBackedDrc": True,
        "fileBackedErc": True,
        "fileBackedExports": True,
        "livePcbRead": True,
        "livePcbWrite": True,
        "chatgptConnectorCompatible": False,
        "cliExports": {
            "ipc2581": True,
            "odb": True,
            "svg": True,
            "dxf": True,
            "step": True,
            "render": True,
            "spiceNetlist": True,
        },
    }
    assert payload["diagnostics"] == []


def test_server_info_contract_reports_degraded_live_context(monkeypatch, sample_project) -> None:
    _ = sample_project
    monkeypatch.setattr("kicad_mcp.server_info.find_kicad_version", lambda _cli: "KiCad 10.0.3")
    monkeypatch.setattr(
        "kicad_mcp.server_info.get_board",
        lambda: (_ for _ in ()).throw(KiCadConnectionError("No PCB is open.")),
    )

    payload = get_server_info_contract()

    _validate_contract(payload)
    assert payload["kicad"]["ipcAvailable"] is False
    assert payload["kicad"]["livePcbContext"] is False
    assert payload["capabilities"]["livePcbRead"] is False
    assert payload["capabilities"]["livePcbWrite"] is False
    assert "Live KiCad PCB context is unavailable: No PCB is open." in payload["diagnostics"]


@pytest.mark.anyio
async def test_server_info_tool_and_resource_return_same_contract(
    monkeypatch,
    sample_project,
) -> None:
    _ = sample_project
    monkeypatch.setattr("kicad_mcp.server_info.find_kicad_version", lambda _cli: "KiCad 10.0.3")
    monkeypatch.setattr(
        "kicad_mcp.server_info.get_board",
        lambda: (_ for _ in ()).throw(KiCadConnectionError("No PCB is open.")),
    )
    server = create_server("minimal")

    tool_payload = await call_tool_payload(server, "kicad_get_server_info", {})
    resource_items = list(await server.read_resource("kicad://server/info"))
    resource_payload = json.loads(resource_items[0].content)

    assert tool_payload == resource_payload
    _validate_contract(resource_payload)
    assert resource_payload["server"] == "kicad-mcp-pro"
