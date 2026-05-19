"""Audit locked project dependencies without auditing the active venv bootstrap tools."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from shutil import which

ROOT = Path(__file__).resolve().parents[1]


def _executable(name: str) -> str:
    resolved = which(name)
    if resolved is None:
        raise RuntimeError(f"Required executable not found on PATH: {name}")
    return resolved


def _run(command: list[str]) -> None:
    subprocess.run(command, cwd=ROOT, check=True)  # noqa: S603  # argv-only command.


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="kicad-mcp-audit-") as tmp:
        requirements = Path(tmp) / "requirements.txt"
        _run(
            [
                _executable("uv"),
                "--quiet",
                "export",
                "--all-extras",
                "--frozen",
                "--format",
                "requirements.txt",
                "--no-emit-project",
                "--no-emit-package",
                "pip",
                "--output-file",
                str(requirements),
            ]
        )
        _run(
            [
                _executable("uvx"),
                "--from",
                "pip-audit==2.10.0",
                "pip-audit",
                "-r",
                str(requirements),
                "--disable-pip",
                "--progress-spinner",
                "off",
            ]
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
