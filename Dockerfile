# =============================================================================
# Multi-stage Dockerfile for wg-easy-blocky
# Single container running: wg-easy (Node.js) + Blocky (Go) + VictoriaMetrics (Go) + VMUI
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build wg-easy (Node.js application)
# -----------------------------------------------------------------------------
FROM docker.io/library/node:krypton-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build-wg-easy
WORKDIR /app

# Update corepack and enable pnpm
RUN npm install --global corepack@latest
RUN corepack enable pnpm

# Install dependencies
COPY src/package.json src/pnpm-lock.yaml src/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Build UI
COPY src ./
RUN pnpm build

# Build amneziawg-tools and amneziawg-go
# renovate: datasource=github-releases depName=amnezia-vpn/amneziawg-tools
ARG AWGTOOLS_BRANCH=v3.0.20260805
# renovate: datasource=github-tags depName=amnezia-vpn/amneziawg-go
ARG AWGGO_BRANCH=v3.0.20260805

RUN apk add --no-cache linux-headers build-base go git && \
    git clone --depth 1 --branch ${AWGTOOLS_BRANCH} https://github.com/amnezia-vpn/amneziawg-tools.git && \
    git clone --depth 1 --branch ${AWGGO_BRANCH} https://github.com/amnezia-vpn/amneziawg-go && \
    cd amneziawg-go && \
    make && \
    cd ../amneziawg-tools/src && \
    make && \
    sed -i 's|\[\[ $proto == -4 \]\] && cmd sysctl -q net\.ipv4\.conf\.all\.src_valid_mark=1|[[ $proto == -4 ]] \&\& [[ $(sysctl -n net.ipv4.conf.all.src_valid_mark) != 1 ]] \&\& cmd sysctl -q net.ipv4.conf.all.src_valid_mark=1|' ./wg-quick/linux.bash

# -----------------------------------------------------------------------------
# Stage 2: Build libsql (for Nitro)
# -----------------------------------------------------------------------------
FROM docker.io/library/node:krypton-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build-libsql
WORKDIR /app
RUN npm install --no-save --omit=dev libsql

# -----------------------------------------------------------------------------
# Stage 3: Shared Go build base (Blocky + VictoriaMetrics)
# -----------------------------------------------------------------------------
FROM docker.io/library/golang:1.26-alpine@sha256:70b46548e42db77e0966aaf3619fd068734dc6c77584d526b91126504fd95816 AS build-go-base
WORKDIR /build
RUN apk add --no-cache git make coreutils

# -----------------------------------------------------------------------------
# Stage 4: Build Blocky (Go DNS server)
# -----------------------------------------------------------------------------
FROM build-go-base AS build-blocky

# renovate: datasource=github-tags depName=0xERR0R/blocky
ARG BLOCKY_VERSION=v0.34.0

# coreutils provides GNU date (busybox date lacks --iso-8601, which Blocky's
# Makefile uses for BUILD_TIME). GO_SKIP_GENERATE skips mockery/go generate
# (generated files are committed upstream).
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    git clone --depth 1 --branch ${BLOCKY_VERSION} https://github.com/0xERR0R/blocky.git && \
    cd blocky && \
    make build GO_SKIP_GENERATE=1

# -----------------------------------------------------------------------------
# Stage 5: Build VictoriaMetrics (Go time-series database)
# -----------------------------------------------------------------------------
FROM build-go-base AS build-victoriametrics

# renovate: datasource=github-tags depName=VictoriaMetrics/VictoriaMetrics
ARG VM_VERSION=v1.113.0

# The -pure target builds with CGO_ENABLED=0 (no C compiler needed) and
# produces a statically linked binary at bin/victoria-metrics-pure.
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    git clone --depth 1 --branch ${VM_VERSION} https://github.com/VictoriaMetrics/VictoriaMetrics.git && \
    cd VictoriaMetrics && \
    make victoria-metrics-pure

# -----------------------------------------------------------------------------
# Stage 6: Final runtime image
# -----------------------------------------------------------------------------
FROM docker.io/library/node:krypton-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime

# Install s6-overlay for process management
# renovate: datasource=github-tags depName=just-containers/s6-overlay
ARG S6_OVERLAY_VERSION=v3.2.0.0
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
        amd64) S6_ARCH="x86_64"; S6_CHECKSUM="ad982a801bd72757c7b1b53539a146cf715e640b4d8f0a6a671a3d1b560fe1e2" ;; \
        arm64) S6_ARCH="aarch64"; S6_CHECKSUM="868973e98210257bba725ff5b17aa092008c9a8e5174499e38ba611a8fc7e473" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    wget -q -O /tmp/s6-overlay-noarch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz" && \
    echo "4b0c0907e6762814c31850e0e6c6762c385571d4656eb8725852b0b1586713b6  /tmp/s6-overlay-noarch.tar.xz" | sha256sum -c - && \
    wget -q -O /tmp/s6-overlay-arch.tar.xz "https://github.com/just-containers/s6-overlay/releases/download/${S6_OVERLAY_VERSION}/s6-overlay-${S6_ARCH}.tar.xz" && \
    echo "${S6_CHECKSUM}  /tmp/s6-overlay-arch.tar.xz" | sha256sum -c - && \
    tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-arch.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

WORKDIR /app

# Health check for WireGuard interface (toolchain-agnostic: works for both
# amneziawg and stock wireguard interfaces)
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD /usr/bin/timeout 5s /bin/sh -c "ip link show ${WG_INTERFACE:-wg0} >/dev/null 2>&1 || exit 1"

# Copy wg-easy build artifacts
COPY --from=build-wg-easy /app/.output /app
COPY --from=build-wg-easy /app/server/database/migrations /app/server/database/migrations
COPY --from=build-libsql /app/node_modules /app/server/node_modules

# Copy CLI and binaries
COPY --from=build-wg-easy /app/cli/cli.sh /usr/local/bin/cli
COPY --from=build-wg-easy /app/amneziawg-go/amneziawg-go /usr/bin/amneziawg-go
COPY --from=build-wg-easy /app/amneziawg-tools/src/wg /usr/bin/awg
COPY --from=build-wg-easy /app/amneziawg-tools/src/wg-quick/linux.bash /usr/bin/awg-quick
COPY --from=build-blocky /build/blocky/bin/blocky /usr/bin/blocky
COPY --from=build-victoriametrics /build/VictoriaMetrics/bin/victoria-metrics-pure /usr/bin/victoria-metrics
RUN chmod +x /usr/local/bin/cli /usr/bin/amneziawg-go /usr/bin/awg /usr/bin/awg-quick /usr/bin/blocky /usr/bin/victoria-metrics

# Install Linux packages
RUN apk add --no-cache \
    dumb-init \
    iptables \
    ip6tables \
    iproute2 \
    kmod \
    iptables-legacy \
    wireguard-go \
    wireguard-tools \
    sqlite \
    curl \
    ca-certificates

RUN mkdir -p /etc/amnezia
RUN ln -sf /etc/wireguard /etc/amnezia/amneziawg

# Use iptables-legacy (symlinks instead of update-alternatives to avoid the
# dpkg dependency; Alpine's iptables-legacy package provides the -legacy binaries)
RUN ln -sf /usr/sbin/iptables-legacy /usr/sbin/iptables && \
    ln -sf /usr/sbin/iptables-legacy-restore /usr/sbin/iptables-restore && \
    ln -sf /usr/sbin/iptables-legacy-save /usr/sbin/iptables-save && \
    ln -sf /usr/sbin/ip6tables-legacy /usr/sbin/ip6tables && \
    ln -sf /usr/sbin/ip6tables-legacy-restore /usr/sbin/ip6tables-restore && \
    ln -sf /usr/sbin/ip6tables-legacy-save /usr/sbin/ip6tables-save

# Create directories for Blocky, VictoriaMetrics, and SQLite
RUN mkdir -p /etc/blocky /data/blocky /data/victoriametrics /etc/wireguard /etc/victoriametrics

# Copy s6 service definitions
COPY docker/s6/ /etc/s6-overlay/s6-rc.d/

# Copy entrypoint script and config templates
COPY docker/entrypoint.sh /docker/entrypoint.sh
COPY docker/blocky/config.yml /docker/blocky/config.yml
COPY docker/victoriametrics/scrape.yml /etc/victoriametrics/scrape.yml
RUN chmod +x /docker/entrypoint.sh

# Set Environment
ENV DEBUG=Server,WireGuard,Database,CMD,Firewall
ENV PORT=51821
ENV HOST=0.0.0.0
ENV INSECURE=false
ENV INIT_ENABLED=false
ENV DISABLE_IPV6=false

# Blocky configuration
ENV BLOCKY_CONFIG=/etc/blocky/config.yml
ENV BLOCKY_LOG_DIR=/data/blocky/logs

# VictoriaMetrics configuration
ENV VM_DATA_DIR=/data/victoriametrics
ENV VM_RETENTION_PERIOD=30d
ENV VM_HTTP_LISTEN_ADDR=:8428
# Bearer token for scraping the wg-easy /metrics endpoint (must match the wg-easy metrics password if one is set)
ENV VM_METRICS_TOKEN=

# WireGuard configuration
ENV WG_INTERFACE=wg0
ENV WG_PORT=51820
ENV WG_DNS=127.0.0.1

LABEL org.opencontainers.image.source=https://github.com/wg-easy/wg-easy
LABEL org.opencontainers.image.description="wg-easy with Blocky DNS, VictoriaMetrics, and VMUI"

# Use custom entrypoint that sets up config then starts s6-overlay
ENTRYPOINT ["/docker/entrypoint.sh", "/init"]

# Default command runs all services via s6
CMD []