"""OpenTelemetry runtime wiring for KiCad MCP Pro."""

from __future__ import annotations

import contextlib
import re
import threading
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from urllib.parse import urlsplit, urlunsplit

from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
    OTLPMetricExporter as GrpcMetricExporter,
)
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
    OTLPSpanExporter as GrpcSpanExporter,
)
from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
    OTLPMetricExporter as HttpMetricExporter,
)
from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
    OTLPSpanExporter as HttpSpanExporter,
)
from opentelemetry.metrics import Counter, Histogram, Meter, UpDownCounter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import MetricExporter, PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter
from opentelemetry.trace import Span, Status, StatusCode, Tracer

_SAFE_COMMAND_TOKEN = re.compile(r"^[A-Za-z0-9_.:-]+$")
_INSTRUMENTATION_SCOPE = "kicad-mcp-pro"


@dataclass
class _TelemetryRuntime:
    configured: bool = False
    enabled: bool = False
    tracer: Tracer | None = None
    meter: Meter | None = None
    managed_tracer_provider: TracerProvider | None = None
    managed_meter_provider: MeterProvider | None = None
    tool_invocations: Counter | None = None
    tool_duration: Histogram | None = None
    session_active: UpDownCounter | None = None
    cli_invocations: Counter | None = None
    cli_duration: Histogram | None = None


_runtime = _TelemetryRuntime()
_runtime_lock = threading.Lock()


def _telemetry_requested(cfg: object) -> bool:
    return bool(getattr(cfg, "telemetry_enabled", False) or getattr(cfg, "otel_endpoint", None))


def _parse_headers(raw_headers: str) -> dict[str, str]:
    headers: dict[str, str] = {}
    for item in raw_headers.split(","):
        key, separator, value = item.partition("=")
        if not separator:
            continue
        normalized_key = key.strip()
        normalized_value = value.strip()
        if normalized_key and normalized_value:
            headers[normalized_key] = normalized_value
    return headers


def _http_signal_endpoint(endpoint: str | None, signal: str) -> str | None:
    if endpoint is None or endpoint == "":
        return None
    endpoint_text: str = endpoint
    parsed = urlsplit(endpoint_text)
    path = parsed.path.rstrip("/")
    desired = f"/v1/{signal}"
    if path == desired:
        return endpoint
    if path in {"", "/"}:
        new_path = desired
    elif path.endswith("/v1/traces") or path.endswith("/v1/metrics"):
        new_path = f"{path.rsplit('/v1/', 1)[0]}{desired}"
    else:
        new_path = f"{path}{desired}"
    return urlunsplit((parsed.scheme, parsed.netloc, new_path, parsed.query, parsed.fragment))


def _endpoint_value(cfg: object) -> str | None:
    endpoint = getattr(cfg, "otel_endpoint", None)
    return str(endpoint) if endpoint not in (None, "") else None


def _resource(cfg: object) -> Resource:
    return Resource.create(
        {"service.name": str(getattr(cfg, "otel_service_name", "kicad-mcp-pro"))}
    )


def _configure_managed_tracer_provider(cfg: object, headers: Mapping[str, str]) -> TracerProvider:
    endpoint = _endpoint_value(cfg)
    protocol = str(getattr(cfg, "otel_protocol", "http/protobuf"))
    provider = TracerProvider(resource=_resource(cfg))
    if protocol == "grpc":
        exporter: SpanExporter = GrpcSpanExporter(endpoint=endpoint, headers=dict(headers) or None)
    else:
        exporter = HttpSpanExporter(
            endpoint=_http_signal_endpoint(endpoint, "traces"),
            headers=dict(headers) or None,
        )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    return provider


def _configure_managed_meter_provider(cfg: object, headers: Mapping[str, str]) -> MeterProvider:
    endpoint = _endpoint_value(cfg)
    protocol = str(getattr(cfg, "otel_protocol", "http/protobuf"))
    if protocol == "grpc":
        exporter: MetricExporter = GrpcMetricExporter(
            endpoint=endpoint,
            headers=dict(headers) or None,
        )
    else:
        exporter = HttpMetricExporter(
            endpoint=_http_signal_endpoint(endpoint, "metrics"),
            headers=dict(headers) or None,
        )
    return MeterProvider(
        resource=_resource(cfg),
        metric_readers=[PeriodicExportingMetricReader(exporter)],
    )


def configure_telemetry(
    cfg: object,
    *,
    tracer_provider: TracerProvider | None = None,
    meter_provider: MeterProvider | None = None,
) -> None:
    """Configure the process-local telemetry runtime."""
    global _runtime
    with _runtime_lock:
        reset_telemetry(shutdown_managed=True)
        if not _telemetry_requested(cfg):
            _runtime = _TelemetryRuntime(configured=True)
            return

        headers = _parse_headers(str(getattr(cfg, "otel_headers", "") or ""))
        managed_tracer_provider = None
        managed_meter_provider = None
        active_tracer_provider = tracer_provider
        active_meter_provider = meter_provider
        if active_tracer_provider is None:
            managed_tracer_provider = _configure_managed_tracer_provider(cfg, headers)
            active_tracer_provider = managed_tracer_provider
        if active_meter_provider is None:
            managed_meter_provider = _configure_managed_meter_provider(cfg, headers)
            active_meter_provider = managed_meter_provider

        meter = active_meter_provider.get_meter(_INSTRUMENTATION_SCOPE)
        _runtime = _TelemetryRuntime(
            configured=True,
            enabled=True,
            tracer=active_tracer_provider.get_tracer(_INSTRUMENTATION_SCOPE),
            meter=meter,
            managed_tracer_provider=managed_tracer_provider,
            managed_meter_provider=managed_meter_provider,
            tool_invocations=meter.create_counter(
                "mcp_tool_invocations_total",
                unit="{invocation}",
                description="MCP tool invocations by tool and status.",
            ),
            tool_duration=meter.create_histogram(
                "mcp_tool_duration_seconds",
                unit="s",
                description="MCP tool invocation duration.",
            ),
            session_active=meter.create_up_down_counter(
                "mcp_session_active",
                unit="{session}",
                description="Active Streamable HTTP MCP sessions.",
            ),
            cli_invocations=meter.create_counter(
                "kicad_cli_invocations_total",
                unit="{invocation}",
                description="KiCad CLI invocations by command and status.",
            ),
            cli_duration=meter.create_histogram(
                "kicad_cli_duration_seconds",
                unit="s",
                description="KiCad CLI invocation duration.",
            ),
        )


def ensure_telemetry_configured(cfg: object) -> None:
    """Configure telemetry once for server entrypoints."""
    with _runtime_lock:
        configured = _runtime.configured
        enabled = _runtime.enabled
    if not configured or (_telemetry_requested(cfg) and not enabled):
        configure_telemetry(cfg)


def reset_telemetry(*, shutdown_managed: bool = False) -> None:
    """Reset process-local telemetry state for tests and config reloads."""
    global _runtime
    managed_tracer_provider = _runtime.managed_tracer_provider
    managed_meter_provider = _runtime.managed_meter_provider
    _runtime = _TelemetryRuntime()
    if shutdown_managed:
        if managed_tracer_provider is not None:
            with contextlib.suppress(Exception):
                managed_tracer_provider.shutdown()
        if managed_meter_provider is not None:
            with contextlib.suppress(Exception):
                managed_meter_provider.shutdown()


def _current_runtime() -> _TelemetryRuntime:
    return _runtime


@contextlib.contextmanager
def tool_span(tool_name: str) -> Iterator[Span | None]:
    runtime = _current_runtime()
    if not runtime.enabled or runtime.tracer is None:
        yield None
        return
    with runtime.tracer.start_as_current_span(
        "mcp.tool",
        attributes={
            "rpc.system": "mcp",
            "rpc.method": "tools/call",
            "mcp.tool.name": tool_name,
        },
    ) as span:
        yield span


def finish_tool_span(span: Span | None, *, status: str, error_code: str | None) -> None:
    if span is None or not span.is_recording():
        return
    span.set_attribute("mcp.tool.status", status)
    if error_code is not None:
        span.set_attribute("error.type", error_code)
    if status != "ok":
        span.set_status(Status(StatusCode.ERROR, error_code or status))


def record_tool_invocation(tool_name: str, status: str, elapsed_seconds: float) -> None:
    runtime = _current_runtime()
    if not runtime.enabled:
        return
    attributes = {"tool": tool_name, "status": status}
    if runtime.tool_invocations is not None:
        runtime.tool_invocations.add(1, attributes)
    if runtime.tool_duration is not None:
        runtime.tool_duration.record(elapsed_seconds, {"tool": tool_name})


@contextlib.contextmanager
def mcp_request_span(
    *,
    http_method: str,
    mount_path: str,
    session_present: bool,
) -> Iterator[Span | None]:
    runtime = _current_runtime()
    if not runtime.enabled or runtime.tracer is None:
        yield None
        return
    with runtime.tracer.start_as_current_span(
        "mcp.request",
        attributes={
            "http.request.method": http_method,
            "url.path": mount_path,
            "rpc.system": "mcp",
            "mcp.session.present": session_present,
        },
    ) as span:
        yield span


def annotate_mcp_request(span: Span | None, *, rpc_method: str | None) -> None:
    if span is None or not span.is_recording() or rpc_method is None:
        return
    span.set_attribute("rpc.method", rpc_method)


def finish_mcp_request_span(span: Span | None, *, status_code: int | None) -> None:
    if span is None or not span.is_recording():
        return
    if status_code is not None:
        span.set_attribute("http.response.status_code", status_code)
        if status_code >= 500:
            span.set_status(Status(StatusCode.ERROR, str(status_code)))


def record_session_delta(delta: int) -> None:
    runtime = _current_runtime()
    if not runtime.enabled or runtime.session_active is None:
        return
    runtime.session_active.add(delta)


def safe_cli_command(args: tuple[str, ...]) -> str:
    """Return a path-free KiCad CLI command label."""
    tokens: list[str] = []
    for raw_token in args:
        token = str(raw_token).strip()
        if not token or token.startswith("-"):
            break
        if "/" in token or "\\" in token:
            break
        if not _SAFE_COMMAND_TOKEN.fullmatch(token):
            break
        tokens.append(token)
        if len(tokens) == 3:
            break
    return " ".join(tokens) if tokens else "unknown"


@contextlib.contextmanager
def cli_span(command: str) -> Iterator[Span | None]:
    runtime = _current_runtime()
    if not runtime.enabled or runtime.tracer is None:
        yield None
        return
    with runtime.tracer.start_as_current_span(
        "kicad.cli",
        attributes={
            "process.executable.name": "kicad-cli",
            "kicad.cli.command": command,
        },
    ) as span:
        yield span


def finish_cli_span(span: Span | None, *, status: str, return_code: int | None) -> None:
    if span is None or not span.is_recording():
        return
    span.set_attribute("kicad.cli.status", status)
    if return_code is not None:
        span.set_attribute("process.exit.code", return_code)
    if status != "ok":
        span.set_status(Status(StatusCode.ERROR, status))


def record_cli_invocation(command: str, status: str, elapsed_seconds: float) -> None:
    runtime = _current_runtime()
    if not runtime.enabled:
        return
    attributes = {"command": command, "status": status}
    if runtime.cli_invocations is not None:
        runtime.cli_invocations.add(1, attributes)
    if runtime.cli_duration is not None:
        runtime.cli_duration.record(elapsed_seconds, {"command": command})


@contextlib.contextmanager
def pcb_parse_span() -> Iterator[Span | None]:
    runtime = _current_runtime()
    if not runtime.enabled or runtime.tracer is None:
        yield None
        return
    with runtime.tracer.start_as_current_span("kicad.pcb.parse") as span:
        yield span


def finish_pcb_parse_span(
    span: Span | None, *, footprint_count: int, elapsed_seconds: float
) -> None:
    if span is None or not span.is_recording():
        return
    span.set_attribute("kicad.pcb.footprint_count", footprint_count)
    span.set_attribute("kicad.pcb.parse.duration_seconds", elapsed_seconds)
