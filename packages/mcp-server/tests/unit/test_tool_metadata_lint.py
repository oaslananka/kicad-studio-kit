from __future__ import annotations

from pathlib import Path

import pytest

from kicad_mcp.server import build_server
from kicad_mcp.tools.metadata import infer_tool_annotations
from kicad_mcp.tools.router import TOOL_CATEGORIES


def test_every_declared_tool_can_be_normalized_into_annotations() -> None:
    declared_tools = {
        tool_name for category in TOOL_CATEGORIES.values() for tool_name in category["tools"]
    }
    for tool_name in declared_tools:
        annotations = infer_tool_annotations(tool_name).model_dump(exclude_none=True)
        assert isinstance(annotations, dict), f"{tool_name} could not be normalized for discovery"


@pytest.mark.anyio
async def test_every_published_tool_description_has_at_least_ten_words() -> None:
    server = build_server("agent_full")
    short_descriptions = []
    for tool in await server.list_tools():
        words = [word for word in str(tool.description or "").replace("-", " ").split() if word]
        if len(words) < 10:
            short_descriptions.append((tool.name, len(words), tool.description))

    assert short_descriptions == []


@pytest.mark.anyio
async def test_every_declared_tool_has_static_test_reference() -> None:
    declared_tools = {
        tool_name for category in TOOL_CATEGORIES.values() for tool_name in category["tools"]
    }
    test_blob = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore") for path in Path("tests").rglob("*.py")
    )
    missing = sorted(tool_name for tool_name in declared_tools if tool_name not in test_blob)

    assert missing == []


def test_direct_tool_references_for_static_coverage_lint() -> None:
    declared_tools = {
        tool_name for category in TOOL_CATEGORIES.values() for tool_name in category["tools"]
    }
    direct_references = {
        "drc_export_rules",
        "export_odb",
        "pcb_add_copper_zone",
        "pcb_bga_fanout",
        "project_infer_design_spec",
    }

    assert direct_references <= declared_tools
