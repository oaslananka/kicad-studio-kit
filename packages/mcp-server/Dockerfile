FROM python:3.12.13-alpine3.22@sha256:a190708a2dec1bd18b1decb539f8e8f5407abaa9bf39cacda583f7f8c11db322 AS builder

ARG UV_VERSION=0.11.12
ENV UV_NO_CACHE=1
WORKDIR /build

RUN python -m pip install --no-cache-dir --disable-pip-version-check --root-user-action=ignore "uv==${UV_VERSION}"
COPY pyproject.toml uv.lock README.md LICENSE ./
COPY src/ src/
RUN uv build --wheel --out-dir /dist \
  && uv export --frozen --no-dev --no-emit-project \
    --no-hashes \
    --format requirements.txt \
    --output-file /dist/requirements.txt

FROM python:3.12.13-alpine3.22@sha256:a190708a2dec1bd18b1decb539f8e8f5407abaa9bf39cacda583f7f8c11db322 AS runtime

ARG KICAD_MCP_VERSION=0.0.0
ARG VCS_REF=unknown
ARG KICAD_CLI_APK_PACKAGE=

ENV PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  KICAD_MCP_TRANSPORT=streamable-http \
  KICAD_MCP_HOST=127.0.0.1
WORKDIR /app

LABEL io.modelcontextprotocol.server.name="io.github.oaslananka/kicad-mcp-pro" \
  org.opencontainers.image.title="kicad-mcp-pro" \
  org.opencontainers.image.description="Professional MCP server for KiCad automation" \
  org.opencontainers.image.source="https://github.com/oaslananka/kicad-studio-kit" \
  org.opencontainers.image.version="${KICAD_MCP_VERSION}" \
  org.opencontainers.image.revision="${VCS_REF}" \
  org.opencontainers.image.licenses="MIT"

RUN apk upgrade --no-cache \
  && if [ -n "${KICAD_CLI_APK_PACKAGE}" ]; then apk add --no-cache "${KICAD_CLI_APK_PACKAGE}"; fi \
  && addgroup -S kicadmcp \
  && adduser -S -G kicadmcp -h /app -s /sbin/nologin kicadmcp

COPY --from=builder /dist/ /tmp/dist/
COPY docker-entrypoint.sh /usr/local/bin/kicad-mcp-pro-entrypoint
RUN python -m pip install --no-cache-dir --disable-pip-version-check --root-user-action=ignore \
    --requirement /tmp/dist/requirements.txt \
    /tmp/dist/*.whl \
  && rm -rf /tmp/dist \
  && chmod 0755 /usr/local/bin/kicad-mcp-pro-entrypoint

USER kicadmcp
EXPOSE 3334
ENTRYPOINT ["kicad-mcp-pro-entrypoint"]
CMD ["--transport", "streamable-http"]
