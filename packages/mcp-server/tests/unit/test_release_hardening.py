from __future__ import annotations

import asyncio
import json
import subprocess
import tomllib
from pathlib import Path
from typing import Any

import anyio
import pytest
from mcp.types import CallToolResult
from starlette.testclient import TestClient

from kicad_mcp.compatibility import MCP_PROTOCOL_VERSION
from kicad_mcp.config import get_config, reset_config
from kicad_mcp.discovery import CliCapabilities
from kicad_mcp.server import CLI_FAILURE_TOOL_NAMES, HEAVY_TOOL_NAMES, build_server
from tests.conftest import call_tool_text

EXPOSED_HOST = "0." + "0.0.0"
STRONG_TOKEN = "".join(("0123456789abcdef", "0123456789ABCDEF"))
ROTATED_STRONG_TOKEN = "".join(("fedcba9876543210", "FEDCBA9876543210"))
HTTP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def _initialize_request() -> dict[str, object]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "compat-test", "version": "1.0.0"},
        },
    }


def _tools_list_request(request_id: int = 2) -> dict[str, object]:
    return {"jsonrpc": "2.0", "id": request_id, "method": "tools/list", "params": {}}


def test_stateful_http_config_controls_fastmcp_setting(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.stateful_http = True
    assert build_server("minimal").settings.stateless_http is False

    reset_config()
    cfg = get_config()
    cfg.stateful_http = False
    assert build_server("minimal").settings.stateless_http is True


def test_stateless_streamable_http_allows_tools_list_without_session_header(
    sample_project: Path,
) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.stateful_http = False
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        initialized = client.post("/mcp", headers=HTTP_HEADERS, json=_initialize_request())
        listed = client.post(
            "/mcp",
            headers={**HTTP_HEADERS, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION},
            json=_tools_list_request(),
        )

    assert initialized.status_code == 200
    assert "mcp-session-id" not in initialized.headers
    assert listed.status_code == 200
    assert listed.json()["result"]["tools"]


def test_stateful_streamable_http_requires_session_header_after_initialize(
    sample_project: Path,
) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.stateful_http = True
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        initialized = client.post("/mcp", headers=HTTP_HEADERS, json=_initialize_request())
        session_id = initialized.headers.get("mcp-session-id")
        missing_session = client.post(
            "/mcp",
            headers={**HTTP_HEADERS, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION},
            json=_tools_list_request(),
        )
        accepted_notification = client.post(
            "/mcp",
            headers={
                **HTTP_HEADERS,
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                "Mcp-Session-Id": str(session_id),
            },
            json={"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
        )
        listed = client.post(
            "/mcp",
            headers={
                **HTTP_HEADERS,
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
                "Mcp-Session-Id": str(session_id),
            },
            json=_tools_list_request(3),
        )

    assert initialized.status_code == 200
    assert session_id
    assert missing_session.status_code == 400
    assert missing_session.json()["error"]["message"] == (
        "Bad Request: Missing MCP-Session-Id header."
    )
    assert accepted_notification.status_code == 202
    assert listed.status_code == 200
    assert listed.json()["result"]["tools"]


@pytest.mark.anyio
async def test_metrics_increment_after_tool_call(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.enable_metrics = True
    server = build_server("minimal")

    await call_tool_text(server, "kicad_get_version", {})

    response = TestClient(server.streamable_http_app()).get("/metrics")

    assert response.status_code == 200
    assert 'kicad_mcp_tool_calls_total{tool="kicad_get_version",status="ok"}' in response.text
    assert "kicad_mcp_tool_latency_p95_ms" in response.text


@pytest.mark.anyio
async def test_heavy_tool_calls_are_rate_limited(sample_project: Path, monkeypatch) -> None:
    _ = sample_project
    server = build_server("full")
    active = 0
    max_active = 0

    async def fake_call_tool(
        name: str,
        arguments: dict[str, Any],
        context: object | None = None,
        convert_result: bool = False,
    ) -> list[object]:
        nonlocal active, max_active
        _ = name, arguments, context, convert_result
        active += 1
        max_active = max(max_active, active)
        await anyio.sleep(0.05)
        active -= 1
        return []

    monkeypatch.setattr(server._tool_manager, "call_tool", fake_call_tool)

    await asyncio.gather(
        server.call_tool("export_gerber", {}),
        server.call_tool("export_gerber", {}),
        server.call_tool("export_gerber", {}),
    )

    assert max_active == 2


def test_release_heavy_tools_are_rate_limited() -> None:
    expected = {
        "run_drc",
        "run_erc",
        "project_quality_gate",
        "check_design_for_manufacture",
        "export_gerber",
        "export_stepz",
        "export_xao",
        "pcb_export_3d_pdf",
        "export_manufacturing_package",
        "route_export_dsn",
        "route_autoroute_freerouting",
        "route_import_ses",
    }

    assert expected.issubset(HEAVY_TOOL_NAMES)


def test_cli_failure_tools_are_structured_error_candidates() -> None:
    expected = {
        "run_drc",
        "run_erc",
        "export_gerber",
        "export_stepz",
        "export_xao",
        "get_board_stats",
        "pcb_export_3d_pdf",
    }

    assert expected.issubset(CLI_FAILURE_TOOL_NAMES)
    # route_* tools return ToolResult directly; failures are encoded in ok=False,
    # not intercepted by the string-match layer.
    assert "route_export_dsn" not in CLI_FAILURE_TOOL_NAMES
    assert "route_autoroute_freerouting" not in CLI_FAILURE_TOOL_NAMES
    assert "route_import_ses" not in CLI_FAILURE_TOOL_NAMES


def test_audit_log_records_keys_without_sensitive_values(monkeypatch) -> None:
    from kicad_mcp import server as server_module

    cfg = get_config()
    cfg.transport = "streamable-http"
    events: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        server_module.logger,
        "info",
        lambda event, **kwargs: events.append((event, kwargs)),
    )

    server_module._audit_tool_call(
        tool_name="example_tool",
        arguments={"auth_token": "super-secret", "normal": "value"},
        status="ok",
        elapsed_ms=1.0,
        error_code=None,
    )

    assert events[0][1]["argument_keys"] == ["auth_token", "normal"]
    assert "super-secret" not in str(events[0])


@pytest.mark.anyio
async def test_http_tool_call_audit_log_is_emitted(sample_project: Path, monkeypatch) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    server = build_server("minimal")
    events: list[tuple[str, dict[str, object]]] = []
    monkeypatch.setattr(
        "kicad_mcp.server.logger.info",
        lambda event, **kwargs: events.append((event, kwargs)),
    )

    await call_tool_text(server, "kicad_get_version", {})

    audit = [item for item in events if item[0] == "tool_call_audit"]
    started = [item for item in events if item[0] == "tool_call_started"]
    finished = [item for item in events if item[0] == "tool_call_finished"]

    assert started
    assert started[0][1]["tool"] == "kicad_get_version"
    assert started[0][1]["argument_keys"] == []
    assert finished
    assert finished[0][1]["tool"] == "kicad_get_version"
    assert finished[0][1]["status"] == "ok"
    assert finished[0][1]["latency_ms"] >= 0
    assert audit
    assert audit[0][1]["tool"] == "kicad_get_version"
    assert audit[0][1]["status"] == "ok"


def test_token_rotation_requires_current_bearer_and_updates_verifier(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.auth_token = STRONG_TOKEN
    server = build_server("minimal")
    client = TestClient(server.streamable_http_app())

    unauthorized = client.post(
        "/.well-known/mcp-server/token-rotate",
        json={"new_token": "new-token"},
    )
    assert unauthorized.status_code == 401

    rotated = client.post(
        "/.well-known/mcp-server/token-rotate",
        headers={"Authorization": f"Bearer {STRONG_TOKEN}"},
        json={"new_token": ROTATED_STRONG_TOKEN},
    )

    assert rotated.status_code == 200
    assert cfg.auth_token == ROTATED_STRONG_TOKEN
    assert asyncio.run(server._token_verifier.verify_token(STRONG_TOKEN)) is None
    assert asyncio.run(server._token_verifier.verify_token(cfg.auth_token)) is not None


def test_token_rotation_rejects_weak_token(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.auth_token = STRONG_TOKEN
    server = build_server("minimal")
    client = TestClient(server.streamable_http_app())

    response = client.post(
        "/.well-known/mcp-server/token-rotate",
        headers={"Authorization": f"Bearer {STRONG_TOKEN}"},
        json={"new_token": "short-token"},
    )

    assert response.status_code == 400
    assert cfg.auth_token == STRONG_TOKEN


def test_non_loopback_http_requires_auth_token(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    try:
        cfg.transport = "streamable-http"
        cfg.host = EXPOSED_HOST
        cfg.auth_token = None

        with pytest.raises(ValueError, match="requires auth_token"):
            build_server("minimal")
    finally:
        reset_config()


def test_non_loopback_http_accepts_strong_token(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    try:
        cfg.transport = "streamable-http"
        cfg.host = EXPOSED_HOST
        cfg.auth_token = STRONG_TOKEN

        assert build_server("minimal").settings.host == EXPOSED_HOST
    finally:
        reset_config()


def test_exposed_metrics_require_authentication(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    try:
        cfg.transport = "streamable-http"
        cfg.host = EXPOSED_HOST
        cfg.auth_token = STRONG_TOKEN
        cfg.enable_metrics = True
        server = build_server("minimal")
        client = TestClient(server.streamable_http_app())

        unauthorized = client.get("/metrics")
        authorized = client.get("/metrics", headers={"Authorization": f"Bearer {STRONG_TOKEN}"})

        assert unauthorized.status_code == 401
        assert authorized.status_code == 200
    finally:
        reset_config()


def test_http_mcp_endpoint_requires_bearer_token(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.auth_token = "required-token"  # noqa: S105 - test fixture
    server = build_server("minimal")
    client = TestClient(server.streamable_http_app())

    missing_token = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
    )
    invalid_token = client.post(
        "/mcp",
        headers={"Accept": "application/json", "Authorization": "Bearer invalid-token"},
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )

    assert missing_token.status_code == 401
    assert missing_token.json()["error"] == "invalid_token"
    assert invalid_token.status_code == 401
    assert invalid_token.json()["error"] == "invalid_token"


def test_token_rotation_rejects_non_string_token(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.auth_token = STRONG_TOKEN
    server = build_server("minimal")
    client = TestClient(server.streamable_http_app())

    response = client.post(
        "/.well-known/mcp-server/token-rotate",
        headers={"Authorization": f"Bearer {STRONG_TOKEN}"},
        json={"new_token": 123},
    )

    assert response.status_code == 400
    assert cfg.auth_token == STRONG_TOKEN


@pytest.mark.anyio
async def test_tool_exception_returns_structured_error() -> None:
    server = build_server("full")

    result = await server.call_tool("export_gerber", {})

    assert isinstance(result, CallToolResult)
    assert result.isError is True
    assert result.structuredContent is not None
    assert result.structuredContent["error_code"] == "CONFIGURATION_ERROR"
    assert "message" in result.structuredContent
    assert "hint" in result.structuredContent


@pytest.mark.anyio
async def test_cli_nonzero_result_returns_structured_error(
    sample_project: Path,
    monkeypatch,
) -> None:
    class Result:
        returncode = 2
        stdout = ""
        stderr = "fatal export failed"

    monkeypatch.setattr(
        "kicad_mcp.tools.export.get_cli_capabilities",
        lambda _cli: CliCapabilities(
            version="KiCad 10.0.1",
            gerber_command="gerber",
            drill_command="drill",
            position_command="pos",
            supports_ipc2581=True,
        ),
    )
    monkeypatch.setattr("kicad_mcp.tools.export.subprocess.run", lambda *_args, **_kwargs: Result())

    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})
    result = await server.call_tool("export_gerber", {})

    assert isinstance(result, CallToolResult)
    assert result.isError is True
    assert result.structuredContent is not None
    assert result.structuredContent["error_code"] == "CLI_COMMAND_FAILED"
    assert "Gerber export failed" in result.structuredContent["message"]


@pytest.mark.anyio
async def test_export_gerber_sends_progress_notifications(
    sample_project: Path,
    monkeypatch,
) -> None:
    progress_events: list[tuple[float, float, str]] = []

    async def fake_report_progress(
        _ctx: object,
        progress: float,
        total: float,
        message: str,
    ) -> None:
        progress_events.append((progress, total, message))

    def fake_run_cli_variants(variants: list[list[str]]) -> tuple[int, str, str]:
        command = variants[0]
        output_index = command.index("--output") + 1
        output_path = Path(command[output_index])
        output_path.mkdir(parents=True, exist_ok=True)
        (output_path / "board-F_Cu.gbr").write_text("gerber\n", encoding="utf-8")
        return 0, "", ""

    monkeypatch.setattr("kicad_mcp.tools.export._report_progress", fake_report_progress)
    monkeypatch.setattr("kicad_mcp.tools.export._run_cli_variants", fake_run_cli_variants)
    monkeypatch.setattr(
        "kicad_mcp.tools.export.get_cli_capabilities",
        lambda _cli: CliCapabilities(
            version="KiCad 10.0.1",
            gerber_command="gerber",
            drill_command="drill",
            position_command="pos",
            supports_ipc2581=True,
        ),
    )

    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})
    result = await call_tool_text(server, "export_gerber", {})

    assert "Gerber export completed" in result
    assert progress_events[0][0:2] == (5, 100)
    assert progress_events[-1][0:2] == (100, 100)


@pytest.mark.anyio
@pytest.mark.mcp_mode("manufacturing")
async def test_manufacturing_gate_block_returns_structured_validation_error(
    sample_project: Path,
    monkeypatch,
) -> None:
    from kicad_mcp.tools.validation import GateOutcome

    monkeypatch.setattr(
        "kicad_mcp.tools.validation._evaluate_project_gate",
        lambda **_kwargs: [
            GateOutcome(name="DRC", status="FAIL", summary="DRC failed", details=["clearance"])
        ],
    )

    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})
    result = await server.call_tool("export_manufacturing_package", {})

    assert isinstance(result, CallToolResult)
    assert result.isError is True
    assert result.structuredContent is not None
    assert result.structuredContent["error_code"] == "VALIDATION_FAILED"


def test_run_cli_retries_transient_timeout(fake_cli: Path, monkeypatch) -> None:
    from kicad_mcp.tools import export

    attempts = 0

    def fake_run(*_args: object, **_kwargs: object):
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise subprocess.TimeoutExpired(cmd="kicad-cli", timeout=0.1)

        class Result:
            returncode = 0
            stdout = "ok"
            stderr = ""

        return Result()

    monkeypatch.setattr(export.subprocess, "run", fake_run)
    monkeypatch.setattr(export.time, "sleep", lambda _seconds: None)

    code, stdout, stderr = export._run_cli("pcb", "export", "gerber")

    assert (code, stdout, stderr) == (0, "ok", "")
    assert attempts == 3


def test_run_cli_does_not_retry_non_transient_exit(fake_cli: Path, monkeypatch) -> None:
    from kicad_mcp.tools import export

    attempts = 0

    def fake_run(*_args: object, **_kwargs: object):
        nonlocal attempts
        attempts += 1

        class Result:
            returncode = 2
            stdout = ""
            stderr = "syntax error"

        return Result()

    monkeypatch.setattr(export.subprocess, "run", fake_run)
    monkeypatch.setattr(export.time, "sleep", lambda _seconds: None)

    code, stdout, stderr = export._run_cli("pcb", "export", "gerber")

    assert (code, stdout, stderr) == (2, "", "syntax error")
    assert attempts == 1


def test_pdn_mesh_reports_ac_impedance_violations() -> None:
    from kicad_mcp.utils.pdn_mesh import PdnDecouplingCap, PdnLoad, PdnMesh

    result = PdnMesh().solve(
        net_name="+3V3",
        source_ref="U_REG",
        loads=[PdnLoad(ref="U1", current_a=0.2, distance_mm=50.0)],
        trace_width_mm=0.25,
        copper_weight_oz=1.0,
        nominal_voltage_v=3.3,
        frequency_points_hz=[1_000_000.0, 100_000_000.0],
        decoupling_caps=[
            PdnDecouplingCap(ref="C1", capacitance_f=100e-9, esr_ohm=0.02, esl_h=1e-9)
        ],
        target_impedance_ohm=0.05,
    )

    assert result.impedance_ohm
    assert result.max_impedance_ohm > 0.0
    assert result.impedance_violations


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _workflow(name: str) -> str:
    return (_repo_root() / ".github" / "workflows" / name).read_text(encoding="utf-8")


def test_release_and_publish_workflows_are_monorepo_ready() -> None:
    release_please = _workflow("release-please.yml")
    publish_extension = _workflow("publish-extension.yml")

    assert (
        "googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7"
        in release_please
    )
    assert "config-file: release-please-config.json" in release_please
    assert "manifest-file: .release-please-manifest.json" in release_please

    assert "VSCE_PAT" in publish_extension
    assert "OVSX_PAT" in publish_extension
    assert ("dev." + "azure.com") not in publish_extension
    assert ("visual" + "studio.com") not in publish_extension


def test_security_and_publish_workflows_emit_supply_chain_evidence() -> None:
    security = _workflow("security.yml")
    publish_extension = _workflow("publish-extension.yml")

    assert "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294" in security
    assert "fail-on-severity: high" in security
    assert "show-patched-versions: true" in security

    assert "corepack pnpm --filter kicadstudiokit run release:assets" in publish_extension
    assert "release-assets/vscode-extension/SHA256SUMS.txt" in publish_extension
    assert "apps/vscode-extension/sbom.cdx.json" in publish_extension
    assert "subject-checksums: release-assets/vscode-extension/SHA256SUMS.txt" in publish_extension

    assert "attestations: write" in publish_extension
    assert "artifact-metadata: write" in publish_extension
    assert "actions/attest@" in publish_extension


def test_docker_metadata_contains_mcp_oci_label_and_release_image_contract() -> None:
    root = Path(__file__).resolve().parents[2]
    dockerfile = (root / "Dockerfile").read_text(encoding="utf-8")
    kicad_dockerfile = (root / "Dockerfile.kicad10").read_text(encoding="utf-8")
    compose = (root / "docker-compose.yml").read_text(encoding="utf-8")
    uv_toml = (root / "uv.toml").read_text(encoding="utf-8")
    docker_install = (root / "docs" / "install" / "docker.md").read_text(encoding="utf-8")
    publishing = (root / "docs" / "publishing.md").read_text(encoding="utf-8")
    deployment = (root / "docs" / "deployment" / "docker.md").read_text(encoding="utf-8")
    uv_version = tomllib.loads(uv_toml).get("required-version")
    assert uv_version

    for content in (dockerfile, kicad_dockerfile):
        assert 'io.modelcontextprotocol.server.name="io.github.oaslananka/kicad-mcp-pro"' in content
        assert (
            'org.opencontainers.image.source="https://github.com/oaslananka/kicad-studio-kit"'
            in content
        )
        assert "ARG KICAD_MCP_VERSION" in content
        assert "ARG VCS_REF" in content
        assert "@sha256:" in content
        assert "EXPOSE 3334" in content
        assert 'CMD ["--transport", "streamable-http"]' in content
        assert "--disable-pip-version-check" in content
        assert "--root-user-action=ignore" in content

    assert "pip install --no-cache-dir uv" not in dockerfile
    assert "pip install --no-cache-dir uv" not in kicad_dockerfile
    assert f"UV_VERSION={uv_version}" in dockerfile
    assert f"UV_VERSION={uv_version}" in kicad_dockerfile
    assert "python:3.13.12-alpine3.22@sha256:" in dockerfile
    assert "KICAD_MCP_HOST=0.0.0.0" in dockerfile
    assert "ARG KICAD_CLI_APK_PACKAGE" in dockerfile
    assert "apk upgrade --no-cache" in dockerfile
    assert 'apk add --no-cache "${KICAD_CLI_APK_PACKAGE}"' in dockerfile
    assert "addgroup -S kicadmcp" in dockerfile
    assert "adduser -S -G kicadmcp" in dockerfile
    assert "apt-get" not in dockerfile
    assert "DEBIAN_FRONTEND" not in dockerfile
    assert "ARG DEBIAN_FRONTEND=noninteractive" in kicad_dockerfile
    assert "ENV KICAD_MCP_HOST=127.0.0.1" in kicad_dockerfile
    assert "ghcr.io/freerouting/freerouting:2.1.0@sha256:" in compose
    assert ":latest" not in compose
    assert "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro" not in docker_install
    assert "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro" not in publishing
    assert "ghcr.io/oaslananka/kicad-studio-kit/kicad-mcp-pro" not in deployment


def test_scorecard_workflow_uses_pinned_actions_without_artifact_storage() -> None:
    workflow = _workflow("scorecard.yml")

    assert "security-events: write" in workflow
    assert "ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a" in workflow
    assert "results_format: sarif" in workflow
    assert "actions/upload-artifact@" not in workflow


def test_version_synchronization_across_release_manifests() -> None:
    repo = _repo_root()
    root_package = json.loads((repo / "package.json").read_text(encoding="utf-8"))
    extension = json.loads(
        (repo / "apps" / "vscode-extension" / "package.json").read_text(encoding="utf-8")
    )
    config = (repo / "release-please-config.json").read_text(encoding="utf-8")
    release_please = json.loads(config)
    manifest = json.loads((repo / ".release-please-manifest.json").read_text(encoding="utf-8"))

    extension_version = manifest["apps/vscode-extension"]
    assert set(manifest) == {
        "apps/vscode-extension",
    }
    assert release_please["separate-pull-requests"] is True
    assert extension["version"] == extension_version
    assert "release:dry-run:kicad-studio" in root_package["scripts"]
    assert "release:dry-run" in root_package["scripts"]
    assert "release:dry-run:kicad-studio" in root_package["scripts"]["release:dry-run"]
    assert "release:dry-run" in root_package["scripts"]["check"]


def test_docs_workflow_deploys_only_from_canonical_repo() -> None:
    workflow = _workflow("docs.yml")
    shell_suppression = "||" + " true"

    assert "github.repository == 'oaslananka/kicad-studio-kit'" not in workflow
    assert "CANONICAL_PAGES_TOKEN" not in workflow
    assert "if: github.event_name != 'pull_request'" in workflow
    legacy_repo = "github.com/oaslananka/kicad-" + "mcp-pro.git"
    assert legacy_repo not in workflow
    assert shell_suppression not in workflow


@pytest.mark.anyio
@pytest.mark.mcp_mode("write")
async def test_project_generate_design_prompt_uses_design_intent(sample_project: Path) -> None:
    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})
    await call_tool_text(
        server,
        "project_set_design_intent",
        {
            "critical_nets": ["USB_DP", "USB_DN"],
            "manufacturer": "JLCPCB",
            "manufacturer_tier": "standard",
            "power_rails": [
                {
                    "name": "+3V3",
                    "voltage_v": 3.3,
                    "current_max_a": 0.5,
                    "source_ref": "U_REG",
                }
            ],
        },
    )

    prompt = await call_tool_text(
        server,
        "project_generate_design_prompt",
        {"circuit_description": "USB sensor", "target_fab": ""},
    )

    assert "USB sensor" in prompt
    assert "USB_DP, USB_DN" in prompt
    assert "+3V3" in prompt
    assert "jlcpcb_standard" in prompt.lower()


@pytest.mark.anyio
@pytest.mark.mcp_mode("experimental")
async def test_export_manufacturing_package_accepts_explicit_variant(
    sample_project: Path,
    monkeypatch,
) -> None:
    commands: list[list[str]] = []

    def fake_run_cli_variants(variants: list[list[str]]) -> tuple[int, str, str]:
        command = variants[0]
        commands.append(command)
        output_index = command.index("--output") + 1
        output_path = Path(command[output_index])
        if output_path.suffix:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text("generated\n", encoding="utf-8")
        else:
            output_path.mkdir(parents=True, exist_ok=True)
            (output_path / "board-F_Cu.gbr").write_text("gerber\n", encoding="utf-8")
        return 0, "", ""

    monkeypatch.setattr(
        "kicad_mcp.tools.validation._evaluate_project_gate",
        lambda **_kwargs: [],
    )
    monkeypatch.setattr("kicad_mcp.tools.export._run_cli_variants", fake_run_cli_variants)
    monkeypatch.setattr(
        "kicad_mcp.tools.export.get_cli_capabilities",
        lambda _cli: CliCapabilities(
            version="KiCad 10.0.1",
            gerber_command="gerber",
            drill_command="drill",
            position_command="pos",
            supports_ipc2581=True,
            supports_cli_variant=True,
        ),
    )

    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})
    await call_tool_text(server, "variant_create", {"name": "lite"})

    result = await call_tool_text(server, "export_manufacturing_package", {"variant": "lite"})

    assert "Gerber export completed" in result
    assert commands
    assert all("--variant" in command and "lite" in command for command in commands)
    active = await call_tool_text(server, "variant_list", {})
    assert '"active_variant": "default"' in active


def test_structured_error_code_unavailable() -> None:
    from kicad_mcp.server import _structured_tool_error_from_message

    result = _structured_tool_error_from_message("kicad-cli is missing")
    assert result.isError is True
    assert result.structuredContent["error_code"] == "CLI_UNAVAILABLE"


def test_health_doctor_schema_and_secret_masking(
    sample_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _ = sample_project
    reset_config()
    cfg = get_config()
    cfg.auth_token = "secret-token"  # noqa: S105
    cfg.kicad_token = "kicad-secret"  # noqa: S105

    from kicad_mcp.diagnostics import build_doctor_report, build_health_report

    health = build_health_report()
    assert health.ok is True
    config_diag = health.config
    assert config_diag.auth_token == {"configured": True}
    assert config_diag.kicad_token == {"configured": True}
    # Ensure secrets are NOT in the output
    health_json = health.model_dump_json()
    assert "secret-token" not in health_json
    assert "kicad-secret" not in health_json

    doctor = build_doctor_report()
    # doctor might not be 'ok' if KiCad is not running, but it should have stable keys
    assert hasattr(doctor, "status")
    assert hasattr(doctor, "checks")
    doctor_json = doctor.model_dump_json()
    assert "secret-token" not in doctor_json
    assert "kicad-secret" not in doctor_json


@pytest.mark.anyio
async def test_export_path_traversal_rejection_strengthened(
    sample_project: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "kicad_mcp.tools.export.get_cli_capabilities",
        lambda _cli: CliCapabilities(
            version="KiCad 10.0.1",
            supports_step=True,
            supports_stepz=True,
            supports_xao=True,
        ),
    )
    server = build_server("full")
    await call_tool_text(server, "kicad_set_project", {"project_dir": str(sample_project)})

    # Test various traversal attempts
    traversals = [
        "../outside.step",
        "../../outside.step",
        "/absolute/path/board.step",
        "nested/../../outside.step",
        " ",
        ".",
        "..",
    ]

    for tool_name in ("export_step", "export_stepz", "export_xao"):
        for path in traversals:
            result = await call_tool_text(server, tool_name, {"output_path": path})
            assert "Invalid output path" in result or "traversal" in result.lower()


def test_tool_registry_invariants_and_profiles() -> None:
    from kicad_mcp.tools.router import (
        TOOL_CATEGORIES,
        available_profiles,
        categories_for_profile,
    )

    # All tools in categories must exist in some way or be registered
    for _category, info in TOOL_CATEGORIES.items():
        assert "tools" in info
        assert isinstance(info["tools"], list)

    # Critical profiles must be stable
    for profile in ["full", "minimal", "pcb", "schematic", "agent_full"]:
        assert profile in available_profiles()
        categories = categories_for_profile(profile)
        assert len(categories) > 0


@pytest.mark.anyio
async def test_lazy_startup_idempotency_and_deferral() -> None:
    from kicad_mcp.server import build_server

    server = build_server("minimal", defer_registration=True)
    assert server._lazy_registration_complete is False

    # First call should trigger registration
    tools = await server.list_tools()
    assert server._lazy_registration_complete is True
    count = len(tools)

    # Repeated calls should be idempotent and not duplicate tools
    tools_repeated = await server.list_tools()
    assert server._lazy_registration_complete is True
    assert len(tools_repeated) == count
