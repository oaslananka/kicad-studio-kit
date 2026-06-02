# Docker Deployment

`kicad-mcp-pro` publishes its container image as:

```text
ghcr.io/oaslananka/kicad-mcp-pro
```

The image is built from the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository, runs as a non-root
user, exposes `3334/tcp`, and starts `kicad-mcp-pro --transport
streamable-http` by default. Inside the container it binds to `0.0.0.0` so
Docker port publishing can reach the server; keep the published host port bound
to loopback unless a trusted reverse proxy or tunnel handles access.

## Run Locally

```bash
docker run --rm \
  -p 127.0.0.1:3334:3334 \
  -e KICAD_MCP_AUTH_TOKEN="replace-with-strong-32-character-token" \
  -e KICAD_MCP_PROJECT_DIR=/projects \
  -v "$PWD:/projects:ro" \
  ghcr.io/oaslananka/kicad-mcp-pro:<version>
```

The MCP endpoint is `http://127.0.0.1:3334/mcp`. The `:latest` tag is published
only for stable MCP server releases; production deployments should pin a
version tag or GHCR digest.

## Volume Mounts

- Mount the KiCad project at `/projects` and set
  `KICAD_MCP_PROJECT_DIR=/projects`.
- Use read-only mounts for inspection and validation workflows.
- Add a writable output mount, for example `/tmp/kicad-mcp-output`, when
  exporting Gerbers, reports, or manufacturing packages.
- If KiCad is not bundled into a derived image, mount the host KiCad install and
  set `KICAD_MCP_KICAD_CLI` to the in-container `kicad-cli` path.

## Environment

| Variable                | Purpose                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `KICAD_MCP_TRANSPORT`   | Defaults to `streamable-http`; use `stdio` only for explicit stdio client runs.  |
| `KICAD_MCP_HOST`        | Defaults to `0.0.0.0` in Docker so port publishing reaches the server.           |
| `KICAD_MCP_PORT`        | Defaults to `3334`.                                                              |
| `KICAD_MCP_AUTH_TOKEN`  | Required when HTTP binds outside loopback. Pass it to clients as a bearer token. |
| `KICAD_MCP_PROJECT_DIR` | In-container KiCad project path.                                                 |
| `KICAD_MCP_OUTPUT_DIR`  | Writable output directory for generated artifacts.                               |
| `KICAD_MCP_KICAD_CLI`   | Optional in-container path to `kicad-cli`.                                       |

## Docker Compose

The repository includes a Compose example at `examples/mcp-docker`:

```bash
export KICAD_MCP_AUTH_TOKEN="replace-with-strong-32-character-token"
docker compose -f examples/mcp-docker/docker-compose.yml up
```

Set `KICAD_PROJECT_DIR` to mount a project other than the bundled LED example.

## ChatGPT Connector

1. Start the Docker service with `KICAD_MCP_AUTH_TOKEN` set.
2. Expose `http://127.0.0.1:3334` through a trusted HTTPS tunnel or reverse
   proxy.
3. Configure the ChatGPT connector URL as `https://<host>/mcp`.
4. Configure bearer-token authentication with the same
   `KICAD_MCP_AUTH_TOKEN`.
5. Keep project mounts read-only unless the workflow intentionally writes
   generated files.

## KiCad CLI Licensing

The published image keeps KiCad external. Local derivative images can install
the Alpine KiCad package with `--build-arg KICAD_CLI_APK_PACKAGE=kicad`, or can
use `Dockerfile.kicad10` from the [oaslananka/kicad-mcp](https://github.com/oaslananka/kicad-mcp) repository with an official KiCad 10 AppImage
URL.

Redistributing an image that bundles KiCad CLI adds KiCad's upstream license
terms to the image. Review the official
[KiCad licenses](https://www.kicad.org/about/licenses/) before publishing a
derived image.
