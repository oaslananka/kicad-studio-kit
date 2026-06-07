# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/devcontainers/python:3.13-bookworm@sha256:bf253e8b9200ad2c159015e87b63dc68a7d185e89cd5a9a1fa9d0d4f4ba6ad76

ARG ACTIONLINT_VERSION=1.7.12
ARG UV_VERSION=0.11.16
ARG DEBIAN_FRONTEND=noninteractive

ENV KICAD_STUDIO_DEVCONTAINER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    UV_LINK_MODE=copy \
    UV_PYTHON=3.13

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      curl \
      dbus \
      dbus-x11 \
      file \
      git \
      git-lfs \
      gnupg \
      jq \
      less \
      make \
      pkg-config \
      shellcheck \
      sudo \
      unzip \
      xauth \
      xvfb \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcairo2 \
      libcups2 \
      libdbus-1-3 \
      libdrm2 \
      libexpat1 \
      libgbm1 \
      libglib2.0-0 \
      libgtk-3-0 \
      libnspr4 \
      libnss3 \
      libpango-1.0-0 \
      libx11-6 \
      libxcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxext6 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      libxrender1 \
      libxshmfence1 \
    && if apt-cache show kicad >/dev/null 2>&1; then \
      apt-get install -y --no-install-recommends kicad; \
    else \
      echo "KiCad is not available from current Debian apt sources; use host or canary lanes for KiCad GUI validation."; \
    fi \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir "uv==${UV_VERSION}" \
    && uv --version \
    && python --version

RUN set -eux; \
    case "$(uname -m)" in \
      x86_64) \
        actionlint_arch="linux_amd64"; \
        actionlint_sha="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"; \
        ;; \
      aarch64|arm64) \
        actionlint_arch="linux_arm64"; \
        actionlint_sha="325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6"; \
        ;; \
      *) \
        echo "Unsupported architecture for actionlint: $(uname -m)" >&2; \
        exit 1; \
        ;; \
    esac; \
    curl -fsSLo /tmp/actionlint.tar.gz \
      "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_${actionlint_arch}.tar.gz"; \
    echo "${actionlint_sha}  /tmp/actionlint.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/actionlint.tar.gz -C /tmp actionlint; \
    install -m 0755 /tmp/actionlint /usr/local/bin/actionlint; \
    rm -f /tmp/actionlint /tmp/actionlint.tar.gz; \
    actionlint -version

RUN mkdir -p /ms-playwright /home/vscode/.cache/uv /home/vscode/.local/share/pnpm/store \
    && chown -R vscode:vscode /ms-playwright /home/vscode/.cache /home/vscode/.local

USER vscode
