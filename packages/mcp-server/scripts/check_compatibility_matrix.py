#!/usr/bin/env python3
"""Validate the repository compatibility matrix against product metadata."""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path
from typing import Any

import yaml

MCP_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = MCP_ROOT.parents[1]
PCBNEW_POLICY = "forbidden-in-production"
REQUIRED_IPC_AREAS = (
    "projectDiscovery",
    "pcbRead",
    "schematicRead",
    "drc",
    "erc",
    "export",
    "diagnostics",
)


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise TypeError(f"{path} must contain a YAML mapping")
    return data


def _pyproject() -> dict[str, Any]:
    return tomllib.loads((MCP_ROOT / "pyproject.toml").read_text(encoding="utf-8"))


def _mcp_compat_from_ts() -> dict[str, str]:
    text = (REPO_ROOT / "apps/vscode-extension/src/mcp/compatibilityMatrix.ts").read_text(
        encoding="utf-8"
    )
    values: dict[str, str] = {}
    for key in ("required", "recommended", "testedAgainst"):
        match = re.search(rf"{key}:\s*'([^']+)'", text)
        if match is None:
            raise ValueError(f"compatibilityMatrix.ts missing {key}")
        values[key] = match.group(1)
    return values


def _extension_protocol_from_ts() -> str:
    text = (REPO_ROOT / "apps/vscode-extension/src/mcp/compatibilityMatrix.ts").read_text(
        encoding="utf-8"
    )
    match = re.search(r"protocolVersion:\s*'([^']+)'", text)
    if match is None:
        raise ValueError("compatibilityMatrix.ts missing protocolVersion")
    return match.group(1)


def _tool_names() -> set[str]:
    text = (MCP_ROOT / "docs/tools-reference.generated.md").read_text(encoding="utf-8")
    return set(re.findall(r"^\| `([^`]+)` \|", text, flags=re.MULTILINE))


def _validate_repo_relative_path(value: Any, label: str) -> list[str]:
    if not isinstance(value, str) or not value:
        return [f"{label} must be a non-empty relative path"]
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        return [f"{label} must stay inside the repository: {value!r}"]
    return []


def _validate_pcbnew_policy(readiness: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    direct = readiness.get("directPcbnewImports")
    if not isinstance(direct, dict):
        return ["kicadIpcReadiness.directPcbnewImports must be a mapping"]
    if direct.get("policy") != PCBNEW_POLICY:
        errors.append(f"kicadIpcReadiness.directPcbnewImports.policy must be {PCBNEW_POLICY!r}")
    allowed = direct.get("allowedPaths")
    if not isinstance(allowed, list) or not allowed:
        return [*errors, "kicadIpcReadiness.directPcbnewImports.allowedPaths must be a list"]
    for index, value in enumerate(allowed):
        errors.extend(
            _validate_repo_relative_path(value, f"directPcbnewImports.allowedPaths[{index}]")
        )
    if "packages/mcp-server/tests/**" not in allowed:
        errors.append("direct pcbnew allowlist must document test-only compatibility paths")
    return errors


def _validate_manual_canary(readiness: dict[str, Any]) -> list[str]:
    manual = readiness.get("manualCanary")
    if not isinstance(manual, dict):
        return ["kicadIpcReadiness.manualCanary must be a mapping"]
    errors: list[str] = []
    for key in ("currentNightlyRange", "releaseCandidateRange"):
        value = manual.get(key)
        if not isinstance(value, str) or re.fullmatch(r"\d+(?:\.\d+)?\.x", value) is None:
            errors.append(f"kicadIpcReadiness.manualCanary.{key} must be a KiCad range")
    for key in ("currentNightlyCommand", "releaseCandidateCommand"):
        if not isinstance(manual.get(key), str) or not manual[key]:
            errors.append(f"kicadIpcReadiness.manualCanary.{key} must be a non-empty command")
    return errors


def _validate_ipc_area(
    area: str,
    detail: Any,
    available_tools: set[str],
) -> list[str]:
    if not isinstance(detail, dict):
        return [f"kicadIpcReadiness.ipcApi.requiredFor.{area} must be a mapping"]
    errors: list[str] = []
    for key in ("tools", "canaryProbes", "evidence"):
        if not isinstance(detail.get(key), list) or not detail[key]:
            errors.append(f"kicadIpcReadiness.ipcApi.requiredFor.{area}.{key} must be a list")
    for tool_name in detail.get("tools", []):
        if isinstance(tool_name, str) and tool_name not in available_tools:
            errors.append(f"kicadIpcReadiness {area} references unknown tool {tool_name!r}")
    for index, evidence in enumerate(detail.get("evidence", [])):
        label = f"kicadIpcReadiness.ipcApi.requiredFor.{area}.evidence[{index}]"
        errors.extend(_validate_repo_relative_path(evidence, label))
        if isinstance(evidence, str) and not (REPO_ROOT / evidence).exists():
            errors.append(f"{label} does not exist: {evidence!r}")
    return errors


def _validate_ipc_readiness(
    matrix: dict[str, Any],
    available_tools: set[str],
) -> list[str]:
    readiness = matrix.get("kicadIpcReadiness")
    if not isinstance(readiness, dict):
        return ["compatibility.yaml missing top-level 'kicadIpcReadiness'"]
    errors = [*_validate_pcbnew_policy(readiness), *_validate_manual_canary(readiness)]
    ipc_api = readiness.get("ipcApi")
    required_for = ipc_api.get("requiredFor") if isinstance(ipc_api, dict) else None
    if not isinstance(required_for, dict):
        return [*errors, "kicadIpcReadiness.ipcApi.requiredFor must be a mapping"]
    for area in REQUIRED_IPC_AREAS:
        if area not in required_for:
            errors.append(f"kicadIpcReadiness.ipcApi.requiredFor missing {area!r}")
            continue
        errors.extend(_validate_ipc_area(area, required_for[area], available_tools))
    return errors


def _validate_required_shape(matrix: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ("schemaVersion", "kicad", "vscode", "node", "pnpm", "python", "mcp", "products"):
        if key not in matrix:
            errors.append(f"compatibility.yaml missing top-level {key!r}")
    if errors:
        return errors
    products = matrix["products"]
    if not isinstance(products, dict):
        return ["compatibility.yaml products must be a mapping"]
    for key in ("kicad-studio", "kicad-mcp-pro"):
        if key not in products:
            errors.append(f"compatibility.yaml products missing {key!r}")
    return errors


def validate_compatibility_matrix() -> list[str]:
    """Return compatibility drift errors without exiting."""
    matrix = _read_yaml(REPO_ROOT / "compatibility.yaml")
    errors = _validate_required_shape(matrix)
    if errors:
        return errors

    extension_pkg = _read_json(REPO_ROOT / "apps/vscode-extension/package.json")
    root_pkg = _read_json(REPO_ROOT / "package.json")
    pyproject = _pyproject()
    server_json = _read_json(MCP_ROOT / "server.json")
    mcp_json = _read_json(MCP_ROOT / "mcp.json")

    studio = matrix["products"]["kicad-studio"]
    mcp_product = matrix["products"]["kicad-mcp-pro"]

    expected_pairs = [
        ("kicad-studio version", studio["version"], extension_pkg["version"]),
        (
            "kicad-studio VS Code engines range",
            matrix["vscode"]["enginesRange"],
            extension_pkg["engines"]["vscode"],
        ),
        (
            "kicad-studio Node runtime",
            matrix["vscode"]["nodeRuntime"],
            extension_pkg["engines"]["node"],
        ),
        ("root Node range", matrix["node"]["range"], root_pkg["engines"]["node"]),
        ("root pnpm range", matrix["pnpm"]["range"], root_pkg["engines"]["pnpm"]),
        ("kicad-mcp-pro version", mcp_product["version"], pyproject["project"]["version"]),
        ("kicad-mcp-pro server.json version", mcp_product["version"], server_json["version"]),
        ("kicad-mcp-pro mcp.json version", mcp_product["version"], mcp_json["version"]),
        ("Python range", matrix["python"]["range"], pyproject["project"]["requires-python"]),
    ]
    for label, expected, actual in expected_pairs:
        if expected != actual:
            errors.append(f"{label} drift: compatibility.yaml={expected!r}, metadata={actual!r}")

    ts_compat = _mcp_compat_from_ts()
    for key, expected in studio["compatibleMcpPro"].items():
        if ts_compat.get(key) != expected:
            errors.append(
                f"extension MCP compatibility {key} drift: "
                f"compatibility.yaml={expected!r}, TS={ts_compat.get(key)!r}"
            )

    extension_protocol = _extension_protocol_from_ts()
    if extension_protocol != matrix["mcp"]["protocolVersion"]:
        errors.append(
            "extension MCP protocol version drift: "
            f"compatibility.yaml={matrix['mcp']['protocolVersion']!r}, TS={extension_protocol!r}"
        )
    mcp_client_source = (REPO_ROOT / "apps/vscode-extension/src/mcp/mcpClient.ts").read_text(
        encoding="utf-8"
    )
    if "protocolVersion: MCP_PROTOCOL_VERSION" not in mcp_client_source:
        errors.append("extension MCP client must initialize with MCP_PROTOCOL_VERSION")

    sys.path.insert(0, str(MCP_ROOT / "src"))
    from kicad_mcp.compatibility import COMPATIBILITY_MATRIX as PY_COMPATIBILITY_MATRIX

    embedded = PY_COMPATIBILITY_MATRIX
    if embedded["mcp"]["protocolVersion"] != matrix["mcp"]["protocolVersion"]:
        errors.append("Python compatibility protocol version drift")
    if embedded["mcp"]["toolSchema"] != matrix["mcp"]["toolSchema"]:
        errors.append("Python compatibility tool schema drift")
    if embedded["kicad"]["primary"] != matrix["kicad"]["primary"]:
        errors.append("Python compatibility primary KiCad version drift")
    if embedded["products"]["kicad-mcp-pro"]["version"] != mcp_product["version"]:
        errors.append("Python compatibility MCP package version drift")

    wellknown_source = (MCP_ROOT / "src/kicad_mcp/wellknown.py").read_text(encoding="utf-8")
    if "MCP_PROTOCOL_VERSION" not in wellknown_source:
        errors.append("well-known server card must use MCP_PROTOCOL_VERSION")
    if "compatibility_summary()" not in wellknown_source:
        errors.append("well-known server card must embed compatibility_summary()")

    available_tools = _tool_names()
    errors.extend(_validate_ipc_readiness(matrix, available_tools))
    for group in ("required", "optional"):
        for tool_name in matrix["mcpTools"][group]:
            if tool_name not in available_tools:
                errors.append(
                    f"compatibility.yaml mcpTools.{group} references unknown tool {tool_name!r}"
                )
    for feature, detail in matrix["featureGates"].items():
        for tool_name in detail.get("tools", []):
            if tool_name not in available_tools:
                errors.append(f"featureGates.{feature} references unknown tool {tool_name!r}")

    return errors


def main() -> int:
    errors = validate_compatibility_matrix()
    if errors:
        print("Compatibility matrix validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Compatibility matrix validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
