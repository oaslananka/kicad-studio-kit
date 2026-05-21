"""Local workflow lint wrapper."""

from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import sys

import yaml

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


def _run(command: list[str]) -> None:
    result = subprocess.run(command, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--actionlint", action="store_true", help="Run actionlint as well.")
    args = parser.parse_args()

    workflow_dir = REPO_ROOT / ".github" / "workflows"
    workflows = [*sorted(workflow_dir.glob("*.yml")), *sorted(workflow_dir.glob("*.yaml"))]
    for path in workflows:
        yaml.safe_load(path.read_text(encoding="utf-8"))
    print(f"Parsed {len(workflows)} workflow file(s).")

    if args.actionlint:
        binary = shutil.which("actionlint")
        if binary is None:
            print(
                "actionlint binary not found; using the workspace actionlint linter.",
                file=sys.stderr,
            )
            _run(["corepack", "pnpm", "--filter", "kicadstudio", "run", "workflows:lint"])
            return
        _run([binary, *(str(path) for path in workflows)])


if __name__ == "__main__":
    main()
