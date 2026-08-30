#!/usr/bin/env python3
"""Extract the static MCP profile vocabulary without executing server code."""

from __future__ import annotations

import ast
import json
import sys


def _assigned_value(node: ast.stmt, name: str) -> ast.expr | None:
    if isinstance(node, ast.Assign) and any(
        isinstance(target, ast.Name) and target.id == name for target in node.targets
    ):
        return node.value
    if (
        isinstance(node, ast.AnnAssign)
        and isinstance(node.target, ast.Name)
        and node.target.id == name
    ):
        return node.value
    return None


def _profile_categories(node: ast.stmt) -> set[str] | None:
    catalog = _assigned_value(node, "PROFILE_CATEGORIES")
    if catalog is None:
        return None
    if not isinstance(catalog, ast.Dict):
        raise ValueError("PROFILE_CATEGORIES is not a dictionary literal")
    keys = [
        key.value
        for key in catalog.keys
        if isinstance(key, ast.Constant) and isinstance(key.value, str)
    ]
    if len(keys) != len(catalog.keys):
        raise ValueError("PROFILE_CATEGORIES has non-literal keys")
    return set(keys)


def _preferred_profiles(node: ast.stmt) -> list[str] | None:
    if not isinstance(node, ast.FunctionDef) or node.name != "available_profiles":
        return None
    for statement in node.body:
        value = _assigned_value(statement, "preferred")
        if value is None:
            continue
        parsed = ast.literal_eval(value)
        if not isinstance(parsed, list) or not all(
            isinstance(item, str) for item in parsed
        ):
            raise ValueError("available_profiles preferred list is not literal")
        return parsed
    return None


def extract_profiles(source: str) -> list[str]:
    module = ast.parse(source)
    profile_categories: set[str] | None = None
    preferred: list[str] | None = None

    for node in module.body:
        profile_categories = _profile_categories(node) or profile_categories
        preferred = _preferred_profiles(node) or preferred

    if not profile_categories or preferred is None:
        raise ValueError("published wheel profile vocabulary could not be parsed")
    return [name for name in preferred if name in profile_categories]


def main() -> None:
    print(json.dumps(extract_profiles(sys.stdin.read())))


if __name__ == "__main__":
    main()
