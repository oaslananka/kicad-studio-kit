#!/usr/bin/env python3
"""Fail when deprecated KiCad SWIG ``pcbnew`` bindings are imported or used.

KiCad 9/10 keep ``pcbnew`` around only as a legacy compatibility surface and
KiCad 11 is expected to remove it. KiCad MCP Pro must keep runtime code on the
supported IPC/CLI surfaces instead of adding new SWIG dependencies.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_DIRS = (ROOT / "src", ROOT / "tests", ROOT / "scripts")
IGNORED_FILES = {Path(__file__).resolve()}


def _is_pcbnew_module(module_name: str | None) -> bool:
    return bool(module_name) and (module_name == "pcbnew" or module_name.startswith("pcbnew."))


def _violations(path: Path) -> list[str]:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as exc:
        return [f"{path}: cannot parse Python file: {exc}"]

    findings: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _is_pcbnew_module(alias.name):
                    findings.append(f"{path}:{node.lineno}: deprecated pcbnew import")
        elif isinstance(node, ast.ImportFrom):
            if _is_pcbnew_module(node.module):
                findings.append(f"{path}:{node.lineno}: deprecated pcbnew import")
        elif isinstance(node, ast.Attribute):
            if isinstance(node.value, ast.Name) and node.value.id == "pcbnew":
                findings.append(f"{path}:{node.lineno}: deprecated pcbnew attribute access")
    return findings


def _python_files() -> list[Path]:
    files: list[Path] = []
    for directory in SCAN_DIRS:
        if directory.exists():
            files.extend(
                path for path in directory.rglob("*.py") if path.resolve() not in IGNORED_FILES
            )
    return sorted(files)


def main() -> int:
    findings: list[str] = []
    for path in _python_files():
        findings.extend(_violations(path))

    if findings:
        print("Deprecated KiCad pcbnew/SWIG usage detected:", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        print(
            "Use kicad-cli, kicad-python IPC, or an explicit adapter boundary instead.",
            file=sys.stderr,
        )
        return 1

    print("No deprecated pcbnew/SWIG usage detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
