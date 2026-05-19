from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load_script(name: str) -> object:
    script = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), script)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_release_preflight_scans_only_current_changelog_section(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_script("check_release_preflight.py")
    monkeypatch.delenv("GITHUB_HEAD_REF", raising=False)
    monkeypatch.delenv("RELEASE_PLEASE_GENERATED_CHANGELOG", raising=False)
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(
        """
## [Unreleased]

## [3.1.8]

* fix current release issue

## [2.0.2]

* Bump version to 2.0.2 and update changelog
""".lstrip(),
        encoding="utf-8",
    )
    monkeypatch.setattr(module, "ROOT", tmp_path)

    assert module._check_changelog("3.1.8") == []

    changelog.write_text(
        """
## [Unreleased]

## [3.1.8]

* Bump version to 2.0.2 and update changelog

## [2.0.2]

* legacy history
""".lstrip(),
        encoding="utf-8",
    )

    errors = module._check_changelog("3.1.8")
    assert errors
    assert "current release section" in errors[0]


def test_release_preflight_skips_release_please_generated_changelog_noise(
    tmp_path: Path,
    monkeypatch,
) -> None:
    module = _load_script("check_release_preflight.py")
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(
        """
## [Unreleased]

## [3.1.8]

* Bump version to 2.0.2 and update changelog
""".lstrip(),
        encoding="utf-8",
    )
    monkeypatch.setattr(module, "ROOT", tmp_path)
    monkeypatch.setenv("RELEASE_PLEASE_GENERATED_CHANGELOG", "true")

    assert module._check_changelog("3.1.8") == []


def test_no_pcbnew_guard_detects_imports(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_script("check_no_pcbnew.py")
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    good = src_dir / "good.py"
    bad = src_dir / "bad.py"
    good.write_text('PCBNEW_TEXT = "import pcbnew in docs only"\n', encoding="utf-8")
    bad.write_text("import pcbnew\npcbnew.LoadBoard('board.kicad_pcb')\n", encoding="utf-8")

    monkeypatch.setattr(module, "SCAN_DIRS", (src_dir,))
    monkeypatch.setattr(module, "IGNORED_FILES", set())

    assert module._violations(good) == []
    assert module.main() == 1
