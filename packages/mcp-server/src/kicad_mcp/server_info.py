"""Versioned server-info and capability discovery contract."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from . import __version__
from .compatibility import MCP_PROTOCOL_VERSION, MCP_TOOL_SCHEMA_VERSION, compatibility_summary
from .config import get_config
from .connection import KiCadConnectionError, get_board, get_kicad
from .discovery import CliCapabilities, get_cli_capabilities

SERVER_INFO_SCHEMA_VERSION = "1.0.0"
_BIND_ALL_HOSTS = {"0.0.0.0", "::"}  # noqa: S104 - bind-all sentinel, not a socket bind.
_SEMVER_NUMBER_RE = re.compile(r"\d+")
TransportType = Literal["stdio", "streamable-http", "sse"]


@dataclass(frozen=True)
class _CliDiscovery:
    found: bool
    version: str | None
    capabilities: CliCapabilities | None


_CLI_DISCOVERY_CACHE: dict[tuple[Path, int | None], _CliDiscovery] = {}


def get_server_info_contract(*, probe_live_context: bool = True) -> dict[str, object]:
    """Return the stable server-info/capabilities payload for clients."""
    cfg = get_config()
    cli = _cached_cli_discovery(cfg.kicad_cli)
    ipc_available, live_pcb_context, live_diagnostic = (
        _probe_live_context() if probe_live_context else (False, False, None)
    )
    diagnostics = _diagnostics(
        cli_found=cli.found,
        live_diagnostic=live_diagnostic,
    )
    return {
        "schemaVersion": SERVER_INFO_SCHEMA_VERSION,
        "server": "kicad-mcp-pro",
        "version": __version__,
        "mcpProtocolVersion": MCP_PROTOCOL_VERSION,
        "toolSchemaVersion": _as_semver(MCP_TOOL_SCHEMA_VERSION),
        "compatibilityRange": _compatibility_range(),
        "transport": get_transport_metadata(),
        "kicad": {
            "cliFound": cli.found,
            "cliPath": str(cfg.kicad_cli),
            "cliVersion": cli.version,
            "ipcAvailable": ipc_available,
            "livePcbContext": live_pcb_context,
        },
        "capabilities": {
            "fileBackedDrc": cli.found,
            "fileBackedErc": cli.found,
            "fileBackedExports": cli.found,
            "livePcbRead": live_pcb_context,
            "livePcbWrite": live_pcb_context,
            "chatgptConnectorCompatible": False,
            "cliExports": {
                "ipc2581": bool(cli.capabilities and cli.capabilities.supports_ipc2581),
                "odb": bool(cli.capabilities and cli.capabilities.supports_odb_export),
                "svg": bool(cli.capabilities and cli.capabilities.supports_svg),
                "dxf": bool(cli.capabilities and cli.capabilities.supports_dxf),
                "step": bool(cli.capabilities and cli.capabilities.supports_step),
                "render": bool(cli.capabilities and cli.capabilities.supports_render),
                "spiceNetlist": bool(cli.capabilities and cli.capabilities.supports_spice_netlist),
            },
        },
        "diagnostics": diagnostics,
    }


def get_transport_metadata() -> dict[str, object]:
    """Return advertised transport metadata shared by server-info and well-known cards."""
    cfg = get_config()
    transport_type = _transport_type()
    return {
        "type": transport_type,
        "streamableHttp": transport_type == "streamable-http",
        "statelessHttp": transport_type == "streamable-http" and not cfg.stateful_http,
        "legacySse": cfg.legacy_sse or transport_type == "sse",
        "authRequired": transport_type != "stdio" and bool(cfg.auth_token),
        "endpoint": _endpoint(transport_type),
    }


def _transport_type() -> TransportType:
    cfg = get_config()
    if cfg.transport == "stdio":
        return "stdio"
    if cfg.transport == "sse" and cfg.legacy_sse:
        return "sse"
    return "streamable-http"


def _endpoint(transport_type: TransportType | None = None) -> str | None:
    cfg = get_config()
    selected_transport = transport_type or _transport_type()
    if selected_transport == "stdio":
        return None
    host = _format_host_for_url(_advertised_host(cfg.host))
    return f"http://{host}:{cfg.port}{cfg.mount_path}"


def _probe_live_context() -> tuple[bool, bool, str | None]:
    try:
        get_kicad()
    except KiCadConnectionError as exc:
        message = str(exc).splitlines()[0] or "KiCad IPC is unavailable."
        return False, False, f"KiCad IPC is unavailable: {message}"
    except Exception as exc:  # pragma: no cover - defensive probe boundary
        message = str(exc).splitlines()[0] or exc.__class__.__name__
        return False, False, f"KiCad IPC probe failed: {message}"

    try:
        get_board()
    except KiCadConnectionError as exc:
        message = str(exc).splitlines()[0] or "KiCad IPC is unavailable."
        return True, False, f"Live KiCad PCB context is unavailable: {message}"
    except Exception as exc:  # pragma: no cover - defensive probe boundary
        message = str(exc).splitlines()[0] or exc.__class__.__name__
        return True, False, f"Live KiCad PCB context probe failed: {message}"
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
    parts = _SEMVER_NUMBER_RE.findall(version)
    if not parts:
        return "0.0.0"
    normalized = [*parts[:3], "0", "0"]
    return ".".join(normalized[:3])


def _cached_cli_discovery(cli_path: Path) -> _CliDiscovery:
    resolved = cli_path.expanduser().resolve(strict=False)
    try:
        mtime_ns: int | None = resolved.stat().st_mtime_ns
    except OSError:
        return _CliDiscovery(found=False, version=None, capabilities=None)

    key = (resolved, mtime_ns)
    cached = _CLI_DISCOVERY_CACHE.get(key)
    if cached is not None:
        return cached

    capabilities = get_cli_capabilities(resolved)
    discovered = _CliDiscovery(found=True, version=capabilities.version, capabilities=capabilities)
    _CLI_DISCOVERY_CACHE[key] = discovered
    return discovered


def _advertised_host(host: str) -> str:
    normalized = host.strip()
    if normalized in _BIND_ALL_HOSTS:
        return "127.0.0.1"
    return normalized


def _format_host_for_url(host: str) -> str:
    if host.startswith("[") and host.endswith("]"):
        return host
    if ":" in host:
        return f"[{host}]"
    return host


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
