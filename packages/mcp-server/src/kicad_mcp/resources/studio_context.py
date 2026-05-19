"""Studio bridge resources and tools."""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from typing import Any, Literal

from mcp.server.fastmcp import FastMCP

from ..config import get_config
from ..discovery import auto_set_project_from_file
from ..tools.metadata import headless_compatible


class _StudioContextStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._payload: dict[str, Any] | None = None

    def get(self) -> dict[str, Any] | None:
        with self._lock:
            return None if self._payload is None else dict(self._payload)

    def set(self, payload: dict[str, Any]) -> None:
        with self._lock:
            self._payload = dict(payload)


_studio_context_store = _StudioContextStore()


def register(mcp: FastMCP) -> None:
    """Register studio bridge resource and context push tool."""

    @mcp.resource("kicad://studio/context")
    def get_studio_context() -> str:
        """Return the latest KiCad Studio IDE context."""
        payload = _studio_context_store.get()
        if payload is None:
            return "KiCad Studio is not connected."
        return json.dumps(payload, indent=2, ensure_ascii=False)

    @mcp.tool()
    @headless_compatible
    def studio_push_context(
        active_file: str,
        file_type: Literal["schematic", "pcb", "other"],
        drc_errors: list[str],
        selected_net: str | None = None,
        selected_reference: str | None = None,
        cursor_position: dict[str, object] | None = None,
    ) -> str:
        """Update the active IDE context pushed by KiCad Studio."""
        payload = {
            "active_file": active_file,
            "file_type": file_type,
            "drc_errors": drc_errors,
            "selected_net": selected_net,
            "selected_reference": selected_reference,
            "cursor_position": cursor_position,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        _studio_context_store.set(payload)

        detected = None
        if active_file and get_config().project_dir is None:
            detected = auto_set_project_from_file(active_file)

        if detected is not None:
            return f"Studio context updated. Active project auto-detected: {detected}"
        return "Studio context updated."
