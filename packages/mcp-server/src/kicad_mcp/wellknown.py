"""Static discovery metadata for HTTP clients."""

from __future__ import annotations

from datetime import UTC, datetime

from . import __version__
from .compatibility import MCP_PROTOCOL_VERSION, compatibility_summary
from .config import get_config
from .server_info import get_server_info_contract
from .tools.router import (
    EXPERIMENTAL_TOOL_NAMES,
    PROFILE_CATEGORIES,
    TOOL_CATEGORIES,
    available_profiles,
)

_SERVER_CARD_LAST_UPDATED = datetime.now(UTC).isoformat()


def get_wellknown_metadata() -> dict[str, object]:
    """Return server discovery metadata for ``/.well-known/mcp-server``."""
    cfg = get_config()
    protocol_version = MCP_PROTOCOL_VERSION
    transport_type = "stdio" if cfg.transport == "stdio" else "streamable-http"
    endpoint = None
    if transport_type != "stdio":
        host = cfg.host if cfg.host not in {"0.0.0.0", "::"} else "127.0.0.1"  # noqa: S104
        endpoint = f"http://{host}:{cfg.port}{cfg.mount_path}"
    return {
        "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
        "version": __version__,
        "protocolVersion": protocol_version,
        "serverInfo": {
            "name": "kicad-mcp-pro",
            "title": "KiCad MCP Pro",
            "version": __version__,
        },
        "transport": {
            "type": transport_type,
            "endpoint": endpoint,
        },
        "capabilities": {
            "tools": True,
            "resources": True,
            "prompts": True,
            "sampling": True,
            "toolCategories": {
                name: {
                    "description": category["description"],
                    "tools": category["tools"],
                }
                for name, category in TOOL_CATEGORIES.items()
            },
            "profiles": {
                profile: list(PROFILE_CATEGORIES[profile]) for profile in available_profiles()
            },
            "experimentalTools": sorted(EXPERIMENTAL_TOOL_NAMES),
        },
        "categories": ["eda", "pcb", "kicad"],
        "description": "Project-aware PCB and schematic workflows for KiCad",
        "profiles": available_profiles(),
        "serverInfoContract": get_server_info_contract(),
        "compatibility": compatibility_summary(),
        "kicad_version_required": (
            "10.0.x primary, 9.x supported, 8.x deprecated file-level fallback"
        ),
        "docs": "https://oaslananka.github.io/kicad-studio-kit",
        "registry": "io.github.oaslananka/kicad-mcp-pro",
        "last_updated": _SERVER_CARD_LAST_UPDATED,
    }
