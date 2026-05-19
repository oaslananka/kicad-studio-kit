#!/usr/bin/env python3
"""Validate the checked MCP registry manifest."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "mcp.json"
SUPPORTED_TRANSPORTS = frozenset({"stdio", "streamable-http", "sse"})
NAME_RE = re.compile(r"^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$")


class ManifestValidationError(ValueError):
    """Raised when an MCP manifest fails validation."""

    def __init__(self, errors: Sequence[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = list(errors)


def _is_object(value: object) -> bool:
    return isinstance(value, Mapping)


def _string(value: object) -> str:
    return value if isinstance(value, str) else ""


def _url_errors(field: str, value: object) -> list[str]:
    url = _string(value)
    if not url:
        return [f"{field} must be a non-empty URL."]
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return [f"{field} must be an https URL."]
    return []


def _repository_url(manifest: Mapping[str, Any]) -> object:
    repository = manifest.get("repository")
    if isinstance(repository, str):
        return repository
    if _is_object(repository):
        return repository.get("url")
    return None


def _transport_type(package: Mapping[str, Any]) -> str:
    transport = package.get("transport")
    if isinstance(transport, str):
        return transport
    if _is_object(transport):
        return _string(transport.get("type"))
    return ""


def _package_identity(package: Mapping[str, Any]) -> tuple[str, str]:
    registry = _string(package.get("registryType")) or _string(package.get("registry"))
    identifier = (
        _string(package.get("identifier"))
        or _string(package.get("name"))
        or _string(package.get("image"))
    )
    return registry, identifier


def _is_oci_registry(registry: str, package: Mapping[str, Any]) -> bool:
    return registry == "oci" or _string(package.get("registry")) == "container"


def _is_oci_identifier(identifier: str) -> bool:
    if not identifier or re.search(r"\s", identifier) or "://" in identifier:
        return False

    segments = identifier.split("/")
    if len(segments) < 2 or any(not segment for segment in segments):
        return False

    image_ref = "/".join(segments[1:])
    if "@" in image_ref:
        name, digest = image_ref.rsplit("@", 1)
        return (
            bool(name) and re.fullmatch(r"[A-Za-z0-9_+.-]+:[A-Za-z0-9=_+.-]+", digest) is not None
        )

    last_segment = segments[-1]
    if ":" not in last_segment:
        return False
    name, tag = last_segment.rsplit(":", 1)
    return bool(name and tag) and re.search(r"\s|/", tag) is None


def _has_command(manifest: Mapping[str, Any], packages: Sequence[Mapping[str, Any]]) -> bool:
    mcp = manifest.get("mcp")
    if _is_object(mcp) and _string(mcp.get("command")):
        return True
    return any(_string(package.get("command")) or _string(package.get("runtimeHint")) for package in packages)


def load_manifest(path: Path = DEFAULT_MANIFEST) -> dict[str, Any]:
    """Load an MCP manifest from disk."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ManifestValidationError(["manifest root must be a JSON object."])
    return data


def validate_manifest(manifest: Mapping[str, Any]) -> list[str]:
    """Return validation errors for an MCP manifest."""
    errors: list[str] = []

    for field in ("name", "description", "version", "license"):
        if not _string(manifest.get(field)):
            errors.append(f"{field} is required.")

    name = _string(manifest.get("name"))
    if name and NAME_RE.fullmatch(name) is None:
        errors.append("name must use reverse-DNS namespace format, for example io.github.org/name.")

    errors.extend(_url_errors("repository.url", _repository_url(manifest)))
    for url_field in ("homepage", "websiteUrl"):
        if url_field in manifest and manifest[url_field]:
            errors.extend(_url_errors(url_field, manifest[url_field]))

    raw_packages = manifest.get("packages")
    if not isinstance(raw_packages, list) or not raw_packages:
        errors.append("packages must be a non-empty list.")
        packages: list[Mapping[str, Any]] = []
    else:
        packages = []
        for index, item in enumerate(raw_packages):
            if not _is_object(item):
                errors.append(f"packages[{index}] must be an object.")
                continue
            packages.append(item)

    if packages and not _has_command(manifest, packages):
        errors.append("manifest must define mcp.command or a package command.")

    seen: set[tuple[str, str]] = set()
    for index, package in enumerate(packages):
        registry, identifier = _package_identity(package)
        if not registry:
            errors.append(f"packages[{index}] must define registryType or registry.")
        if not identifier:
            errors.append(f"packages[{index}] must define identifier, name, or image.")
        if not _string(package.get("version")):
            errors.append(f"packages[{index}] must define version.")
        if _is_oci_registry(registry, package):
            if "registryBaseUrl" in package:
                errors.append(
                    f"packages[{index}] must not define registryBaseUrl for OCI packages; "
                    "use a canonical registry/repository:tag identifier."
                )
            if identifier and not _is_oci_identifier(identifier):
                errors.append(
                    f"packages[{index}] OCI identifier must be registry/repository:tag "
                    "or registry/repository@algorithm:digest."
                )
        pair = (registry, identifier)
        if registry and identifier and pair in seen:
            errors.append(f"packages[{index}] duplicates package {registry}/{identifier}.")
        seen.add(pair)

        transport = _transport_type(package)
        if not transport:
            errors.append(f"packages[{index}] must define transport.type.")
        elif transport not in SUPPORTED_TRANSPORTS:
            errors.append(f"packages[{index}] uses unsupported transport {transport!r}.")

    mcp = manifest.get("mcp")
    if _is_object(mcp):
        transports = mcp.get("transports")
        if isinstance(transports, list):
            for transport in transports:
                if transport not in SUPPORTED_TRANSPORTS:
                    errors.append(f"mcp.transports contains unsupported transport {transport!r}.")

    return errors


def validate_manifest_file(path: Path = DEFAULT_MANIFEST) -> dict[str, Any]:
    """Load and validate an MCP manifest, raising on failure."""
    manifest = load_manifest(path)
    errors = validate_manifest(manifest)
    if errors:
        raise ManifestValidationError(errors)
    return manifest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest",
        nargs="?",
        default=str(DEFAULT_MANIFEST),
        help="Path to mcp.json, default: repository root mcp.json.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    path = Path(args.manifest)
    try:
        validate_manifest_file(path)
    except (OSError, json.JSONDecodeError, ManifestValidationError) as exc:
        print(f"MCP manifest validation failed for {path}:", file=sys.stderr)
        if isinstance(exc, ManifestValidationError):
            for error in exc.errors:
                print(f"- {error}", file=sys.stderr)
        else:
            print(f"- {exc}", file=sys.stderr)
        return 1
    print(f"MCP manifest validation passed: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
