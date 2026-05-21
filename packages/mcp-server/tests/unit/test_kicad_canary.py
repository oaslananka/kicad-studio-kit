from __future__ import annotations

import sys
from pathlib import Path

from scripts import kicad_canary
from scripts.kicad_canary import CanaryStep, build_canary_matrix, supports_feature_gate


def _compatibility_matrix() -> dict[str, object]:
    return {
        "kicad": {
            "primary": "10.0.x",
            "supported": [
                {
                    "range": "10.0.x",
                    "state": "primary",
                    "ci": "required",
                },
                {
                    "range": "9.x",
                    "state": "supported",
                    "ci": "scheduled",
                },
                {
                    "range": "8.x",
                    "state": "deprecated",
                    "ci": "manual",
                },
            ],
        },
        "featureGates": {
            "manufacturingExports": {
                "kicad": ["9.x", "10.0.x"],
            }
        },
    }


def test_kicad_canary_matrix_uses_scheduled_compatibility_lanes() -> None:
    matrix = build_canary_matrix(_compatibility_matrix(), include_manual=False)

    assert matrix == {
        "include": [
            {
                "id": "kicad-10-primary",
                "range": "10.0.x",
                "state": "primary",
                "ci": "required",
                "ppa": "ppa:kicad/kicad-10.0-releases",
                "package": "kicad",
                "continue_on_error": False,
            },
            {
                "id": "kicad-9-supported",
                "range": "9.x",
                "state": "supported",
                "ci": "scheduled",
                "ppa": "ppa:kicad/kicad-9.0-releases",
                "package": "kicad",
                "continue_on_error": False,
            },
            {
                "id": "kicad-10-nightly",
                "range": "10.0.x",
                "state": "prerelease",
                "ci": "scheduled",
                "ppa": "ppa:kicad/kicad-10.0-nightly",
                "package": "kicad",
                "continue_on_error": True,
            },
        ]
    }


def test_kicad_canary_matrix_exposes_manual_deprecated_lane_on_dispatch() -> None:
    matrix = build_canary_matrix(_compatibility_matrix(), include_manual=True)

    assert matrix["include"][2] == {
        "id": "kicad-8-deprecated",
        "range": "8.x",
        "state": "deprecated",
        "ci": "manual",
        "ppa": "ppa:kicad/kicad-8.0-releases",
        "package": "kicad",
        "continue_on_error": True,
    }
    assert matrix["include"][3]["id"] == "kicad-10-nightly"


def test_kicad_canary_gates_manufacturing_exports_by_compatibility_range() -> None:
    compatibility = _compatibility_matrix()

    assert supports_feature_gate(compatibility, "manufacturingExports", "10.0.x")
    assert supports_feature_gate(compatibility, "manufacturingExports", "9.x")
    assert not supports_feature_gate(compatibility, "manufacturingExports", "8.x")


def test_violation_step_only_accepts_documented_kicad_exit_code(tmp_path: Path) -> None:
    cli = Path(sys.executable)
    script = tmp_path / "fake_kicad_cli.py"
    script.write_text("import sys\nsys.exit(2)\n", encoding="utf-8")

    result = kicad_canary._run_step(
        cli,
        CanaryStep(
            name="dirty-drc",
            fixture="dirty",
            args=(str(script),),
            expects_violations=True,
        ),
        tmp_path / "artifacts",
    )

    assert result["returncode"] == 2
    assert result["ok"] is False


def test_timeout_step_writes_artifact_logs(tmp_path: Path, monkeypatch) -> None:
    cli = Path(sys.executable)
    script = tmp_path / "hanging_kicad_cli.py"
    script.write_text(
        "import time\nprint('started', flush=True)\ntime.sleep(1)\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(kicad_canary, "DEFAULT_TIMEOUT_SECONDS", 0.01)
    artifacts = tmp_path / "artifacts"

    result = kicad_canary._run_step(
        cli,
        CanaryStep(name="version", fixture="compatibility", args=(str(script),)),
        artifacts,
    )

    assert result["ok"] is False
    assert result["returncode"] == -1
    assert "timed out" in (artifacts / "logs" / "version.stderr.log").read_text(encoding="utf-8")


def test_version_range_rejects_wrong_minor_for_minor_pinned_range(tmp_path: Path) -> None:
    stdout = tmp_path / "version.stdout.log"
    stderr = tmp_path / "version.stderr.log"
    stdout.write_text("KiCad 10.1.0\n", encoding="utf-8")
    stderr.write_text("", encoding="utf-8")

    error = kicad_canary._version_range_error(
        {"stdout": str(stdout), "stderr": str(stderr)},
        "10.0.x",
    )

    assert error is not None
    assert "10.0.x" in error


def test_run_canary_writes_summary_when_version_range_fails(tmp_path: Path, monkeypatch) -> None:
    cli = Path(sys.executable)
    script = tmp_path / "version_kicad_cli.py"
    script.write_text("print('KiCad 10.1.0')\n", encoding="utf-8")

    monkeypatch.setattr(kicad_canary, "_resolve_cli", lambda: cli)
    monkeypatch.setattr(kicad_canary, "_read_compatibility_matrix", _compatibility_matrix)
    monkeypatch.setattr(
        kicad_canary,
        "_command_plan",
        lambda artifacts, compatibility, kicad_range: [
            CanaryStep(name="version", fixture="compatibility", args=(str(script),))
        ],
    )

    artifacts = tmp_path / "artifacts"
    exit_code = kicad_canary.run_canary(artifacts, "10.0.x")

    assert exit_code == 1
    assert (artifacts / "summary.json").exists()
    assert (artifacts / "failing-fixtures.txt").read_text(encoding="utf-8") == ("compatibility\n")
