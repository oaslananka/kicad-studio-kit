from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = ROOT.parents[1]
WRAPPER_ROOT = ROOT.parent / "mcp-npm"


def test_npm_wrapper_package_is_separate_from_private_root_package() -> None:
    root_package = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    wrapper_package = json.loads((WRAPPER_ROOT / "package.json").read_text(encoding="utf-8"))

    assert root_package["private"] is True
    assert wrapper_package["name"] == "kicad-mcp-pro"
    assert wrapper_package["bin"]["kicad-mcp-pro"] == "bin/kicad-mcp-pro.js"
    assert wrapper_package["mcpName"] == "io.github.oaslananka/kicad-mcp-pro"


def test_npm_wrapper_fails_clearly_when_uvx_is_missing() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not available")

    env = os.environ.copy()
    env["PATH"] = ""
    result = subprocess.run(
        [node, str(WRAPPER_ROOT / "bin" / "kicad-mcp-pro.js"), "--help"],
        cwd=WRAPPER_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )

    assert result.returncode == 127
    assert "uvx was not found on PATH." in result.stderr
    assert "does not install the Python package" in result.stderr
