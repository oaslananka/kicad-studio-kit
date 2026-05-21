from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient
from starlette.types import Receive, Scope, Send

from kicad_mcp.compatibility import MCP_PROTOCOL_VERSION
from kicad_mcp.config import get_config
from kicad_mcp.server import _StreamableHttpContractMiddleware, build_server

HTTP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
}


def _initialize_request() -> dict[str, object]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "mcp-contract-test", "version": "1.0.0"},
        },
    }


def _tools_list_request(request_id: int = 2) -> dict[str, object]:
    return {"jsonrpc": "2.0", "id": request_id, "method": "tools/list", "params": {}}


def _assert_json_rpc_error(
    response,
    *,
    status_code: int,
    code: int,
    message: str,
    request_id: object | None,
) -> None:
    assert response.status_code == status_code
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["jsonrpc"] == "2.0"
    assert payload["id"] == request_id
    assert payload["error"]["code"] == code
    assert payload["error"]["message"] == message


def test_chatgpt_connector_stateless_tools_list_does_not_require_session_header(
    sample_project: Path,
) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.stateful_http = False
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        initialized = client.post("/mcp", headers=HTTP_HEADERS, json=_initialize_request())
        listed = client.post("/mcp", headers=HTTP_HEADERS, json=_tools_list_request())

    assert initialized.status_code == 200
    assert "mcp-session-id" not in initialized.headers
    assert listed.status_code == 200
    tool_names = {tool["name"] for tool in listed.json()["result"]["tools"]}
    assert "kicad_get_version" in tool_names


def test_stateful_session_errors_are_structured_and_spec_aligned(
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
        missing_session = client.post("/mcp", headers=HTTP_HEADERS, json=_tools_list_request())
        invalid_session = client.post(
            "/mcp",
            headers={**HTTP_HEADERS, "Mcp-Session-Id": "missing-session"},
            json=_tools_list_request(3),
        )
        listed = client.post(
            "/mcp",
            headers={**HTTP_HEADERS, "Mcp-Session-Id": str(session_id)},
            json=_tools_list_request(4),
        )

    assert initialized.status_code == 200
    assert session_id
    _assert_json_rpc_error(
        missing_session,
        status_code=400,
        code=-32000,
        message="Bad Request: Missing MCP-Session-Id header.",
        request_id=2,
    )
    _assert_json_rpc_error(
        invalid_session,
        status_code=404,
        code=-32001,
        message="Session not found for MCP-Session-Id.",
        request_id=3,
    )
    assert listed.status_code == 200


def test_stateful_malformed_json_rpc_is_not_masked_by_session_check(
    sample_project: Path,
) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    cfg.stateful_http = True
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        response = client.post(
            "/mcp",
            headers=HTTP_HEADERS,
            json={"jsonrpc": "2.0", "id": 9, "params": {}},
        )

    payload = response.json()
    assert response.status_code == 400
    assert payload["jsonrpc"] == "2.0"
    assert payload["error"]["code"] != -32000
    assert payload["error"]["message"] != "Bad Request: Missing MCP-Session-Id header."


def test_streamable_http_rejects_unsupported_protocol_version_header(
    sample_project: Path,
) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        response = client.post(
            "/mcp",
            headers={**HTTP_HEADERS, "MCP-Protocol-Version": "1900-01-01"},
            json=_initialize_request(),
        )

    _assert_json_rpc_error(
        response,
        status_code=400,
        code=-32002,
        message=f"Unsupported MCP-Protocol-Version: 1900-01-01. Expected {MCP_PROTOCOL_VERSION}.",
        request_id=1,
    )


def test_streamable_http_requires_json_and_sse_accept_header(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        response = client.post(
            "/mcp",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
            },
            json=_initialize_request(),
        )

    _assert_json_rpc_error(
        response,
        status_code=400,
        code=-32003,
        message="Bad Request: Accept header must include application/json and text/event-stream.",
        request_id=1,
    )


def test_streamable_http_accepts_split_accept_headers(sample_project: Path) -> None:
    _ = sample_project
    cfg = get_config()
    cfg.transport = "streamable-http"
    server = build_server("minimal")

    with TestClient(server.streamable_http_app(), base_url="http://127.0.0.1:3334") as client:
        response = client.post(
            "/mcp",
            headers=[
                ("Accept", "application/json"),
                ("Accept", "text/event-stream"),
                ("Content-Type", "application/json"),
                ("MCP-Protocol-Version", MCP_PROTOCOL_VERSION),
            ],
            json=_initialize_request(),
        )

    assert response.status_code == 200


def test_contract_middleware_bounds_remembered_streamable_http_sessions() -> None:
    async def app(scope: Scope, receive: Receive, send: Send) -> None:
        _ = scope, receive, send

    middleware = _StreamableHttpContractMiddleware(app)

    for index in range(257):
        middleware._remember_session(f"session-{index}")

    assert middleware._has_session("session-0") is False
    assert middleware._has_session("session-256") is True
    assert len(middleware._session_ids) == 256
