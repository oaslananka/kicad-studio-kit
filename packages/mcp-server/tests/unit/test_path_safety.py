from __future__ import annotations

from pathlib import Path

import pytest

from kicad_mcp.config import KiCadMCPConfig
from kicad_mcp.errors import KiCadNotRunningError, UnsafePathError, error_payload
from kicad_mcp.utils.paths import relative_subpath, resolve_under


def test_resolve_within_project_blocks_traversal(sample_project: Path) -> None:
    cfg = KiCadMCPConfig(project_dir=sample_project)

    with pytest.raises(UnsafePathError):
        cfg.resolve_within_project("../outside.txt")


def test_explicit_workspace_blocks_outside_absolute_path(tmp_path: Path, fake_cli: Path) -> None:
    workspace = tmp_path / "workspace"
    project = workspace / "project"
    outside = tmp_path / "outside.txt"
    project.mkdir(parents=True)
    outside.write_text("x", encoding="utf-8")

    cfg = KiCadMCPConfig(kicad_cli=fake_cli, workspace_root=workspace, project_dir=project)

    with pytest.raises(UnsafePathError):
        cfg.resolve_within_project(outside)


def test_output_subdir_blocks_parent_traversal(sample_project: Path) -> None:
    cfg = KiCadMCPConfig(project_dir=sample_project)

    with pytest.raises(UnsafePathError):
        cfg.ensure_output_dir("../escape")


def test_path_utils_wrapper_resolves_safe_paths(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    nested = workspace / "project" / "board.kicad_pcb"
    nested.parent.mkdir(parents=True)
    nested.write_text("(kicad_pcb)", encoding="utf-8")

    assert resolve_under(workspace, "project/board.kicad_pcb") == nested
    assert resolve_under(workspace, nested) == nested
    assert relative_subpath("exports/gerbers") == Path("exports/gerbers")


def test_error_payload_masks_domain_shape() -> None:
    payload = error_payload(RuntimeError("boom"))

    assert payload == {
        "code": "INTERNAL_ERROR",
        "message": "boom",
        "hint": "Run doctor for diagnostics and retry with corrected configuration.",
        "retryable": False,
    }


def test_relative_subpath_blocks_absolute_path(tmp_path: Path) -> None:
    with pytest.raises(UnsafePathError):
        relative_subpath(tmp_path)


def test_error_payload_preserves_domain_error() -> None:
    payload = error_payload(KiCadNotRunningError("not reachable"))

    assert payload["code"] == "KICAD_NOT_RUNNING"
    assert payload["message"] == "not reachable"
    assert payload["retryable"] is True


def test_error_payload_falls_back_to_exception_name() -> None:
    payload = error_payload(RuntimeError())

    assert payload["message"] == "RuntimeError"
