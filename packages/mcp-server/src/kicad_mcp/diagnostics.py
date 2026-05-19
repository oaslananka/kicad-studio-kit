"""Health and doctor diagnostics for CLI and integrations."""

from __future__ import annotations

import platform
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from . import __version__
from .config import get_config
from .connection import KiCadConnectionError, get_board
from .discovery import find_kicad_version

CheckStatus = Literal["ok", "warn", "error", "skipped"]
OverallStatus = Literal["ok", "degraded", "error"]


class CheckResult(BaseModel):
    """One diagnostics check result."""

    name: str
    status: CheckStatus
    message: str
    hint: str = ""


class PackageDiagnostics(BaseModel):
    """Installed package information."""

    name: str = "kicad-mcp-pro"
    version: str = __version__


class PythonDiagnostics(BaseModel):
    """Python runtime information."""

    version: str = Field(default_factory=platform.python_version)
    executable: str | None = None


class McpDiagnostics(BaseModel):
    """MCP server runtime settings."""

    transport_default: str
    profile: str


class KiCadDiagnostics(BaseModel):
    """KiCad CLI and IPC availability."""

    cli_path: str | None
    cli_found: bool
    version: str | None = None
    ipc_reachable: bool = False
    headless: bool = False


class ConfigDiagnostics(BaseModel):
    """Sanitized server configuration fields."""

    workspace_root: str | None = None
    project_dir: str | None = None
    output_dir: str | None = None
    timeout_ms: int
    retries: int
    headless: bool
    log_level: str
    log_format: str
    transport: str
    auth_token: dict[str, bool]
    kicad_token: dict[str, bool]


class DiagnosticReport(BaseModel):
    """Machine-readable health/doctor report."""

    ok: bool
    status: OverallStatus
    package: PackageDiagnostics = Field(default_factory=PackageDiagnostics)
    python: PythonDiagnostics = Field(default_factory=PythonDiagnostics)
    mcp: McpDiagnostics
    kicad: KiCadDiagnostics
    config: ConfigDiagnostics
    checks: list[CheckResult] = Field(default_factory=list)


def _status(checks: list[CheckResult]) -> tuple[bool, OverallStatus]:
    if any(check.status == "error" for check in checks):
        return False, "error"
    if any(check.status == "warn" for check in checks):
        return True, "degraded"
    return True, "ok"


def _cli_found(path: Path) -> bool:
    return path.exists()


def build_diagnostic_report(*, probe_cli: bool, probe_ipc: bool) -> DiagnosticReport:
    """Build a diagnostics report without raising for non-fatal KiCad unavailability."""
    cfg = get_config()
    checks: list[CheckResult] = []

    cli_found = _cli_found(cfg.kicad_cli)
    kicad_version: str | None = None
    if cli_found:
        checks.append(
            CheckResult(
                name="kicad_cli",
                status="ok",
                message=f"kicad-cli found at {cfg.kicad_cli}",
            )
        )
        if probe_cli:
            kicad_version = find_kicad_version(cfg.kicad_cli)
            checks.append(
                CheckResult(
                    name="kicad_cli_version",
                    status="ok" if kicad_version else "warn",
                    message=kicad_version or "Could not read KiCad CLI version.",
                    hint="" if kicad_version else "Verify that kicad-cli runs on this machine.",
                )
            )
    else:
        checks.append(
            CheckResult(
                name="kicad_cli",
                status="warn",
                message=f"kicad-cli was not found at {cfg.kicad_cli}",
                hint="Install KiCad or set KICAD_CLI_PATH/KICAD_MCP_KICAD_CLI.",
            )
        )

    ipc_reachable = False
    if probe_ipc:
        try:
            get_board()
            ipc_reachable = True
            checks.append(
                CheckResult(
                    name="kicad_ipc",
                    status="ok",
                    message="KiCad IPC is reachable and a board is open.",
                )
            )
        except KiCadConnectionError as exc:
            checks.append(
                CheckResult(
                    name="kicad_ipc",
                    status="warn",
                    message=str(exc).splitlines()[0],
                    hint="Start KiCad, enable the IPC API server, and open a board.",
                )
            )
    else:
        checks.append(
            CheckResult(
                name="kicad_ipc",
                status="skipped",
                message="KiCad IPC probe deferred for fast health check.",
                hint="Run doctor --json for a deeper probe.",
            )
        )

    ok, status = _status(checks)
    return DiagnosticReport(
        ok=ok,
        status=status,
        python=PythonDiagnostics(executable=sys.executable),
        mcp=McpDiagnostics(transport_default=cfg.transport, profile=cfg.profile),
        kicad=KiCadDiagnostics(
            cli_path=str(cfg.kicad_cli) if cfg.kicad_cli else None,
            cli_found=cli_found,
            version=kicad_version,
            ipc_reachable=ipc_reachable,
            headless=cfg.headless,
        ),
        config=ConfigDiagnostics.model_validate(cfg.safe_diagnostics()),
        checks=checks,
    )


def build_health_report() -> DiagnosticReport:
    """Build a fast health report that never requires KiCad IPC."""
    return build_diagnostic_report(probe_cli=False, probe_ipc=False)


def build_doctor_report() -> DiagnosticReport:
    """Build a deeper doctor report with non-fatal KiCad probes."""
    return build_diagnostic_report(probe_cli=True, probe_ipc=True)
