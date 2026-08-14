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
RUN pnpm install

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
# Stage 3: Build Blocky (Go DNS server)
# -----------------------------------------------------------------------------
FROM docker.io/library/golang:1.23-alpine AS build-blocky
WORKDIR /build

# renovate: datasource=github-tags depName=0xERR0R/blocky
ARG BLOCKY_VERSION=v0.34.0

RUN apk add --no-cache git make && \
    git clone --depth 1 --branch ${BLOCKY_VERSION} https://github.com/0xERR0R/blocky.git && \
    cd blocky && \
    make build

# -----------------------------------------------------------------------------
# Stage 4: Build VictoriaMetrics (Go time-series database)
# -----------------------------------------------------------------------------
FROM docker.io/library/golang:1.23-alpine AS build-victoriametrics
WORKDIR /build

# renovate: datasource=github-tags depName=VictoriaMetrics/VictoriaMetrics
ARG VM_VERSION=v1.113.0

RUN apk add --no-cache git make && \
    git clone --depth 1 --branch ${VM_VERSION} https://github.com/VictoriaMetrics/VictoriaMetrics.git && \
    cd VictoriaMetrics && \
    make victoria-metrics

# -----------------------------------------------------------------------------
# Stage 5: Final runtime image
# -----------------------------------------------------------------------------
FROM docker.io/library/node:krypton-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS runtime

# Install s6-overlay for process management
# renovate: datasource=github-tags depName=just-containers/s6-overlay
ARG S6_OVERLAY_VERSION=v3.2.0.0
ADD https://github.com/just-containers/s6-overlay/releases/download/${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp/
ADD https://github.com/just-containers/s6-overlay/releases/download/${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp/
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz && \
    tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz && \
    rm /tmp/s6-overlay-*.tar.xz

WORKDIR /app

# Health check for WireGuard interface
HEALTHCHECK --interval=1m --timeout=5s --retries=3 CMD /usr/bin/timeout 5s /bin/sh -c "/usr/bin/wg show | /bin/grep -q interface || exit 1"

# Copy wg-easy build artifacts
COPY --from=build-wg-easy /app/.output /app
COPY --from=build-wg-easy /app/server/database/migrations /app/server/database/migrations
COPY --from=build-libsql /app/node_modules /app/server/node_modules

# Copy CLI
COPY --from=build-wg-easy /app/cli/cli.sh /usr/local/bin/cli
RUN chmod +x /usr/local/bin/cli

# Copy amneziawg binaries
COPY --from=build-wg-easy /app/amneziawg-go/amneziawg-go /usr/bin/amneziawg-go
COPY --from=build-wg-easy /app/amneziawg-tools/src/wg /usr/bin/awg
COPY --from=build-wg-easy /app/amneziawg-tools/src/wg-quick/linux.bash /usr/bin/awg-quick
RUN chmod +x /usr/bin/amneziawg-go /usr/bin/awg /usr/bin/awg-quick

# Copy Blocky binary
COPY --from=build-blocky /build/blocky/blocky /usr/bin/blocky
RUN chmod +x /usr/bin/blocky

# Copy VictoriaMetrics binary
COPY --from=build-victoriametrics /build/VictoriaMetrics/bin/victoria-metrics-prod /usr/bin/victoria-metrics
RUN chmod +x /usr/bin/victoria-metrics

# Install Linux packages
RUN apk add --no-cache \
    dpkg \
    dumb-init \
    iptables \
    ip6tables \
    nftables \
    kmod \
    iptables-legacy \
    wireguard-go \
    wireguard-tools \
    sqlite \
    curl \
    ca-certificates

RUN mkdir -p /etc/amnezia
RUN ln -sf /etc/wireguard /etc/amnezia/amneziawg

# Use iptables-legacy
RUN update-alternatives --install /usr/sbin/iptables iptables /usr/sbin/iptables-legacy 10 \
    --slave /usr/sbin/iptables-restore iptables-restore /usr/sbin/iptables-legacy-restore \
    --slave /usr/sbin/iptables-save iptables-save /usr/sbin/iptables-legacy-save
RUN update-alternatives --install /usr/sbin/ip6tables ip6tables /usr/sbin/ip6tables-legacy 10 \
    --slave /usr/sbin/ip6tables-restore ip6tables-restore /usr/sbin/ip6tables-legacy-restore \
    --slave /usr/sbin/ip6tables-save ip6tables-save /usr/sbin/ip6tables-legacy-save

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