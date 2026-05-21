"""Versioned server-info and capability discovery contract."""

from __future__ import annotations

from typing import cast

from . import __version__
from .compatibility import MCP_PROTOCOL_VERSION, MCP_TOOL_SCHEMA_VERSION, compatibility_summary
from .config import LOOPBACK_HOSTS, get_config
from .connection import KiCadConnectionError, get_board
from .discovery import find_kicad_version, get_cli_capabilities

SERVER_INFO_SCHEMA_VERSION = "1.0.0"


def get_server_info_contract() -> dict[str, object]:
    """Return the stable server-info/capabilities payload for clients."""
    cfg = get_config()
    cli_found = cfg.kicad_cli.exists()
    cli_version = find_kicad_version(cfg.kicad_cli)
    cli_capabilities = get_cli_capabilities(cfg.kicad_cli) if cli_found else None
    ipc_available, live_pcb_context, live_diagnostic = _probe_live_context()
    diagnostics = _diagnostics(
        cli_found=cli_found,
        live_diagnostic=live_diagnostic,
    )
    return {
        "schemaVersion": SERVER_INFO_SCHEMA_VERSION,
        "server": "kicad-mcp-pro",
        "version": __version__,
        "mcpProtocolVersion": MCP_PROTOCOL_VERSION,
        "toolSchemaVersion": _as_semver(MCP_TOOL_SCHEMA_VERSION),
        "compatibilityRange": _compatibility_range(),
        "transport": {
            "type": _transport_type(),
            "streamableHttp": cfg.transport != "stdio",
            "statelessHttp": cfg.transport != "stdio" and not cfg.stateful_http,
            "legacySse": cfg.legacy_sse,
            "authRequired": cfg.transport != "stdio" and bool(cfg.auth_token),
            "endpoint": _endpoint(),
        },
        "kicad": {
            "cliFound": cli_found,
            "cliPath": str(cfg.kicad_cli),
            "cliVersion": cli_version,
            "ipcAvailable": ipc_available,
            "livePcbContext": live_pcb_context,
        },
        "capabilities": {
            "fileBackedDrc": cli_found,
            "fileBackedErc": cli_found,
            "fileBackedExports": cli_found,
            "livePcbRead": live_pcb_context,
            "livePcbWrite": live_pcb_context,
            "chatgptConnectorCompatible": False,
            "cliExports": {
                "ipc2581": bool(cli_capabilities and cli_capabilities.supports_ipc2581),
                "odb": bool(cli_capabilities and cli_capabilities.supports_odb_export),
                "svg": bool(cli_capabilities and cli_capabilities.supports_svg),
                "dxf": bool(cli_capabilities and cli_capabilities.supports_dxf),
                "step": bool(cli_capabilities and cli_capabilities.supports_step),
                "render": bool(cli_capabilities and cli_capabilities.supports_render),
                "spiceNetlist": bool(cli_capabilities and cli_capabilities.supports_spice_netlist),
            },
        },
        "diagnostics": diagnostics,
    }


def _transport_type() -> str:
    return "stdio" if get_config().transport == "stdio" else "streamable-http"


def _endpoint() -> str | None:
    cfg = get_config()
    if cfg.transport == "stdio":
        return None
    host = cfg.host if cfg.host in LOOPBACK_HOSTS else "127.0.0.1"
    return f"http://{host}:{cfg.port}{cfg.mount_path}"


def _probe_live_context() -> tuple[bool, bool, str | None]:
    try:
        get_board()
    except KiCadConnectionError as exc:
        message = str(exc).splitlines()[0] or "KiCad IPC is unavailable."
        return False, False, f"Live KiCad PCB context is unavailable: {message}"
    except Exception as exc:  # pragma: no cover - defensive probe boundary
        message = str(exc).splitlines()[0] or exc.__class__.__name__
        return False, False, f"Live KiCad PCB context probe failed: {message}"
    return True, True, None


def _diagnostics(*, cli_found: bool, live_diagnostic: str | None) -> list[str]:
    diagnostics: list[str] = []
    if not cli_found:
        diagnostics.append(
            "KiCad CLI is unavailable; file-backed DRC/ERC/export operations are disabled."
        )
    if live_diagnostic is not None:
        diagnostics.append(live_diagnostic)
    return diagnostics


def _as_semver(version: str) -> str:
    parts = version.split(".")
    if len(parts) == 1:
        return f"{version}.0.0"
    if len(parts) == 2:
        return f"{version}.0"
    return version


def _compatibility_range() -> dict[str, dict[str, str]]:
    matrix = compatibility_summary()
    products = cast(dict[str, object], matrix["products"])
    studio = cast(dict[str, object], products["kicad-studio"])
    mcp_pro = cast(dict[str, object], products["kicad-mcp-pro"])
    studio_range = cast(dict[str, str], studio["compatibleMcpPro"])
    extension_range = cast(dict[str, str], mcp_pro["compatibleExtension"])
    return {
        "kicadStudio": {
            "required": studio_range["required"],
            "recommended": studio_range["recommended"],
            "testedAgainst": studio_range["testedAgainst"],
        },
        "kicadMcpPro": {
            "required": extension_range["required"],
            "testedAgainst": extension_range["testedAgainst"],
        },
    }
