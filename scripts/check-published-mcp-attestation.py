#!/usr/bin/env python3
"""Verify the exact published MCP wheel/sdist and release-tag signing identity.

This is a consumer gate: it does not build, publish, or select MCP 2026.
Requires uvx and GitHub CLI (both already available in the cross-repo canary).
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

PACKAGE = "kicad-mcp-pro"
PUBLISHER_OWNER = os.environ.get("KICAD_MCP_PUBLISHER_OWNER", "")
PUBLISHER_REPO = os.environ.get("KICAD_MCP_PUBLISHER_REPO", "")
OWNER_REPO = f"{PUBLISHER_OWNER}/{PUBLISHER_REPO}"
WORKFLOW = f"{OWNER_REPO}/.github/workflows/publish-python.yml"
ATTESTATIONS_VERSION = "0.0.30"


def command(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=25) as response:
        return json.load(response)


def artifacts(metadata: dict, version: str) -> list[dict]:
    expected = {
        f"kicad_mcp_pro-{version}-py3-none-any.whl",
        f"kicad_mcp_pro-{version}.tar.gz",
    }
    files = metadata.get("urls", [])
    if not isinstance(files, list) or {f.get("filename") for f in files} != expected:
        raise ValueError("PyPI release must contain exactly the expected wheel and sdist")
    for item in files:
        parsed = urllib.parse.urlparse(item["url"])
        if (parsed.scheme, parsed.hostname) != ("https", "files.pythonhosted.org"):
            raise ValueError("Unexpected PyPI artifact host")
        if Path(parsed.path).name != item["filename"]:
            raise ValueError("PyPI URL filename differs from metadata")
        if not re.fullmatch(r"[a-f0-9]{64}", item.get("digests", {}).get("sha256", "")):
            raise ValueError("Missing PyPI SHA-256 digest")
    return files


def verify_publisher(provenance: dict) -> None:
    bundles = provenance.get("attestation_bundles", [])
    expected = {
        "kind": "GitHub",
        "repository": OWNER_REPO,
        "workflow": "publish-python.yml",
        "environment": "pypi",
    }
    if not bundles or not all(
        bundle.get("publisher") == expected and bundle.get("attestations")
        for bundle in bundles
    ):
        raise ValueError("PyPI Trusted Publisher identity or attestation missing")


def verify(version: str) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", OWNER_REPO):
        raise ValueError("Expected exact publisher owner and repository in CI environment")
    if not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", version):
        raise ValueError("Expected an exact stable PyPI major.minor.patch version")
    tag = f"mcp-server-v{version}"
    tag_object = json.loads(command("gh", "api", f"repos/{OWNER_REPO}/git/ref/tags/{tag}"))["object"]
    if tag_object.get("type") != "commit" or not re.fullmatch(r"[a-f0-9]{40}", tag_object.get("sha", "")):
        raise ValueError("Expected a release tag pointing to a commit")
    source_sha = tag_object["sha"]
    files = artifacts(fetch_json(f"https://pypi.org/pypi/{PACKAGE}/{version}/json"), version)

    with tempfile.TemporaryDirectory(prefix="studio-mcp-attestation-") as tmp:
        directory = Path(tmp)
        for item in files:
            filename = item["filename"]
            provenance = fetch_json(f"https://pypi.org/integrity/{PACKAGE}/{version}/{filename}/provenance")
            verify_publisher(provenance)
            with urllib.request.urlopen(item["url"], timeout=60) as response:
                contents = response.read()
            if hashlib.sha256(contents).hexdigest() != item["digests"]["sha256"]:
                raise ValueError(f"PyPI digest mismatch for {filename}")
            (directory / filename).write_bytes(contents)

            command(
                "uvx", "--from", f"pypi-attestations=={ATTESTATIONS_VERSION}",
                "pypi-attestations", "verify", "pypi", "--repository", f"https://github.com/{OWNER_REPO}",
                item["url"],
            )

        release_dir = directory / "github-release"
        release_dir.mkdir()
        command(
            "gh", "release", "download", tag, "--repo", OWNER_REPO,
            "--dir", str(release_dir),
            *(argument for item in files for argument in ("--pattern", item["filename"])),
        )
        for item in files:
            filename = item["filename"]
            if hashlib.sha256((release_dir / filename).read_bytes()).hexdigest() != item["digests"]["sha256"]:
                raise ValueError(f"GitHub Release and PyPI differ: {filename}")
            command(
                "gh", "attestation", "verify", str(directory / filename),
                "--repo", OWNER_REPO,
                "--predicate-type", "https://cyclonedx.org/bom",
                "--signer-workflow", WORKFLOW,
                "--source-ref", f"refs/tags/{tag}",
                "--source-digest", source_sha,
                "--format", "json",
            )
            print(f"PASS {filename}: PyPI signature, GitHub attestation, digest, source {source_sha[:12]}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: check-published-mcp-attestation.py <exact-stable-version>")
    verify(sys.argv[1])
