from __future__ import annotations

import yaml

from kicad_mcp.compatibility import COMPATIBILITY_MATRIX, MCP_PROTOCOL_VERSION
from scripts.check_compatibility_matrix import (
    PCBNEW_POLICY,
    REPO_ROOT,
    REQUIRED_IPC_AREAS,
    validate_compatibility_matrix,
)


def test_embedded_compatibility_metadata_declares_current_contract() -> None:
    assert COMPATIBILITY_MATRIX["mcp"]["protocolVersion"] == MCP_PROTOCOL_VERSION
    assert COMPATIBILITY_MATRIX["kicad"]["primary"] == "10.0.x"
    assert (
        COMPATIBILITY_MATRIX["products"]["kicad-studio"]["compatibleMcpPro"]["required"]
        == ">=3.5.2 <4.0.0"
    )


def test_repository_compatibility_matrix_has_no_drift() -> None:
    assert validate_compatibility_matrix() == []


def test_kicad_ipc_readiness_contract_covers_pcbnew_and_parity() -> None:
    matrix = yaml.safe_load((REPO_ROOT / "compatibility.yaml").read_text(encoding="utf-8"))
    readiness = matrix["kicadIpcReadiness"]
    direct_imports = readiness["directPcbnewImports"]
    required_for = readiness["ipcApi"]["requiredFor"]

    assert direct_imports["policy"] == PCBNEW_POLICY
    assert direct_imports["allowedPaths"] == [
        "packages/mcp-server/scripts/check_no_pcbnew.py",
        "packages/mcp-server/tests/**",
    ]
    assert set(REQUIRED_IPC_AREAS).issubset(required_for)
    assert readiness["manualCanary"]["currentNightlyRange"] == "10.99.x"
    assert readiness["manualCanary"]["releaseCandidateRange"] == "11.0.x"
