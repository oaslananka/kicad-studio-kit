from __future__ import annotations

import pytest

from kicad_mcp.server import build_server
from kicad_mcp.tools.router import EXPERIMENTAL_TOOL_NAMES, PROFILE_CATEGORIES, TOOL_CATEGORIES


@pytest.mark.anyio
async def test_profile_tool_matrix_matches_declared_categories() -> None:
    for profile_name, categories in PROFILE_CATEGORIES.items():
        server = build_server(profile_name)
        listed = [tool.name for tool in await server.list_tools()]
        listed_set = set(listed)
        expected: list[str] = []
        for category in categories:
            expected.extend(TOOL_CATEGORIES[category]["tools"])

        assert len(listed) == len(listed_set)
        assert listed_set.issubset(set(expected))
        if profile_name == "agent_full":
            assert listed_set == set(expected)
        else:
            assert listed_set == (set(expected) - EXPERIMENTAL_TOOL_NAMES)
