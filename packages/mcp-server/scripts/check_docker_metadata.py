"""Validate Docker and OCI metadata used by release packaging."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]
MCP_SERVER_NAME = "io.github.oaslananka/kicad-mcp-pro"


def _read(path: str) -> str:
    return (PACKAGE_ROOT / path).read_text(encoding="utf-8")


def _read_repo(path: str) -> str:
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def _uv_required_version() -> str | None:
    try:
        config = tomllib.loads(_read("uv.toml"))
    except (FileNotFoundError, tomllib.TOMLDecodeError):
        return None
    if version := config.get("required-version"):
        return str(version)
    return None


def main() -> int:
    errors: list[str] = []
    uv_version = _uv_required_version()
    if uv_version is None:
        errors.append("uv.toml must define a valid required-version")
    dockerfiles = {
        "Dockerfile": _read("Dockerfile"),
        "Dockerfile.kicad10": _read("Dockerfile.kicad10"),
    }

    for path, content in dockerfiles.items():
        required = [
            f'io.modelcontextprotocol.server.name="{MCP_SERVER_NAME}"',
            'org.opencontainers.image.source="https://github.com/oaslananka/kicad-studio-kit"',
            "ARG KICAD_MCP_VERSION",
            "ARG VCS_REF",
        ]
        for marker in required:
            if marker not in content:
                errors.append(f"{path} is missing {marker}")
        if "@sha256:" not in content:
            errors.append(f"{path} must pin Docker base images by digest")
        if uv_version is not None and f"ARG UV_VERSION={uv_version}" not in content:
            errors.append(f"{path} must pin ARG UV_VERSION={uv_version}")

    kicad10 = dockerfiles["Dockerfile.kicad10"]
    if "pip install --no-cache-dir uv" in kicad10:
        errors.append("Dockerfile.kicad10 must pin UV_VERSION instead of installing uv unpinned")
    if "ENV KICAD_MCP_HOST=127.0.0.1" not in kicad10:
        errors.append(
            "Dockerfile.kicad10 must bind HTTP to loopback unless an auth token is injected"
        )

    compose = _read("docker-compose.yml")
    if ":latest" in compose:
        errors.append("docker-compose.yml must not use :latest images")
    if "ghcr.io/freerouting/freerouting:2.1.0@sha256:" not in compose:
        errors.append("docker-compose.yml must pin the freerouting image by digest")

    docker_workflow = _read_repo(".github/workflows/publish-mcp-registry.yml")
    if "type=raw,value=latest" in docker_workflow:
        errors.append("publish-mcp-registry.yml must not publish a mutable latest tag")

    for doc_path in ("docs/install/docker.md", "docs/publishing.md"):
        if "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro:latest" in _read(doc_path):
            errors.append(f"{doc_path} must use versioned or digest-pinned image examples")

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    print("Docker metadata validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
