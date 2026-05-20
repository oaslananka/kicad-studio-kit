from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load_validator() -> object:
    script = ROOT / "scripts" / "validate_mcp_manifest.py"
    spec = importlib.util.spec_from_file_location("validate_mcp_manifest", script)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_checked_mcp_manifest_is_valid() -> None:
    module = _load_validator()
    manifest = module.validate_manifest_file(ROOT / "mcp.json")

    assert manifest["name"] == "io.github.oaslananka/kicad-mcp-pro"
    assert manifest["repository"]["url"] == "https://github.com/oaslananka/kicad-studio-kit"
    assert manifest["repository"]["subfolder"] == "packages/mcp-server"
    assert [package["runtimeHint"] for package in manifest["packages"]] == [
        "uvx",
        "npx",
        "docker",
    ]
    assert all(package["version"] == manifest["version"] for package in manifest["packages"])
    assert manifest["packages"][2]["identifier"].endswith(f":{manifest['version']}")


def test_validator_rejects_missing_command(tmp_path: Path) -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    for package in manifest["packages"]:
        package.pop("command", None)
        package.pop("runtimeHint", None)
    path = tmp_path / "mcp.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")

    errors = module.validate_manifest(module.load_manifest(path))

    assert "manifest must define mcp.command or a package command." in errors


def test_validator_rejects_duplicate_packages(tmp_path: Path) -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"].append(dict(manifest["packages"][0]))
    path = tmp_path / "mcp.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")

    errors = module.validate_manifest(module.load_manifest(path))

    assert any("duplicates package pypi/kicad-mcp-pro" in error for error in errors)


def test_validator_rejects_unsupported_transport() -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"][0]["transport"]["type"] = "websocket"

    errors = module.validate_manifest(manifest)

    assert "packages[0] uses unsupported transport 'websocket'." in errors


def test_validator_rejects_oci_registry_base_url() -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"][2]["registryBaseUrl"] = "https://ghcr.io"

    errors = module.validate_manifest(manifest)

    assert (
        "packages[1] must not define registryBaseUrl for OCI packages; "
        "use a canonical registry/repository:tag identifier."
    ).replace("packages[1]", "packages[2]") in errors


def test_validator_rejects_missing_package_version() -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"][2].pop("version")

    errors = module.validate_manifest(manifest)

    assert "packages[2] must define version." in errors


def test_validator_accepts_oci_identifier_with_digest() -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    digest = "a" * 64
    manifest["packages"][2]["identifier"] = (
        f"ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro@sha256:{digest}"
    )

    errors = module.validate_manifest(manifest)

    assert not errors


def test_validator_accepts_oci_identifier_with_single_repository_segment() -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"][2]["identifier"] = "ghcr.io/kicad-mcp-pro:3.4.0"

    errors = module.validate_manifest(manifest)

    assert not errors


@pytest.mark.parametrize(
    "identifier",
    [
        "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro",
        "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:",
        "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:3.4.0 bad",
        "https://ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:3.4.0",
    ],
)
def test_validator_rejects_malformed_oci_identifier(identifier: str) -> None:
    module = _load_validator()
    manifest = json.loads((ROOT / "mcp.json").read_text(encoding="utf-8"))
    manifest["packages"][2]["identifier"] = identifier

    errors = module.validate_manifest(manifest)

    assert (
        "packages[2] OCI identifier must be registry/repository:tag "
        "or registry/repository@algorithm:digest."
    ) in errors
