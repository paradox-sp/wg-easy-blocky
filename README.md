# WireGuard Easy + Blocky

[![Build & Release](https://github.com/paradox-sp/wg-easy-blocky/actions/workflows/build-release.yml/badge.svg)](https://github.com/paradox-sp/wg-easy-blocky/actions/workflows/build-release.yml)
[![GitHub Stars](https://img.shields.io/github/stars/paradox-sp/wg-easy-blocky)](https://github.com/paradox-sp/wg-easy-blocky/stargazers)
[![License](https://img.shields.io/github/license/paradox-sp/wg-easy-blocky)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/paradox-sp/wg-easy-blocky)](https://github.com/paradox-sp/wg-easy-blocky/releases/latest)

You have found the easiest way to install & manage WireGuard on any Linux host!

This fork bundles **Blocky** (ad/tracker-blocking DNS) and **VictoriaMetrics** (monitoring) into the **same container** as WireGuard Easy — a single, low-footprint Docker service with a web dashboard, ad-blocking DNS for all VPN clients, and a monitoring dashboard. No separate containers required.

<p align="center">
  <img src="./assets/screenshot.png" width="802" alt="wg-easy Screenshot" />
</p>

## Features

- All-in-one: WireGuard + Web UI.
- Easy installation, simple to use.
- List, create, edit, delete, enable & disable clients.
- Show a client's QR code.
- Download a client's configuration file.
- Statistics for which clients are connected.
- Tx/Rx charts for each connected client.
- Gravatar support.
- Automatic Light / Dark Mode
- Multilanguage Support
- One Time Links
- Client Expiration
- Prometheus metrics support
- IPv6 support
- CIDR support
- 2FA support
- Per-client firewall filtering (requires iptables)
- Blocky DNS filtering with ad/tracker blocking
- Raw DNS query history with search/filter
- VictoriaMetrics time-series metrics with embedded VMUI dashboards
- Per-client DNS routed through Blocky
- OIDC support (Google, GitHub, Authelia, Authentik, etc.)

> [!NOTE]
> To better manage documentation for this project, it has its own site here: [https://wg-easy.github.io/wg-easy/latest](https://wg-easy.github.io/wg-easy/latest)

- [Getting Started](https://wg-easy.github.io/wg-easy/latest/getting-started/)
- [Basic Installation](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/basic-installation/)
- [Caddy](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/caddy/)
- [Traefik](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/traefik/)
- [Podman](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/podman-nft/)
- [AdGuard Home](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/adguard/)

> [!NOTE]
> If you want to migrate from the old version to the new version, you can find the migration guide here: [Migration Guide](https://wg-easy.github.io/wg-easy/latest/advanced/migrate/)

## Installation

This is a quick start guide to get you up and running with WireGuard Easy.

For a more detailed installation guide, please refer to the [Getting Started](https://wg-easy.github.io/wg-easy/latest/getting-started/) page.

### 1. Install Docker

If you haven't installed Docker yet, install it by running as root:

```shell
curl -sSL https://get.docker.com | sh
exit
```

And log in again.

### 2. Run WireGuard Easy

The easiest way to run WireGuard Easy is with Docker Compose.

Just follow [these steps](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/basic-installation/) in the detailed documentation.

You can also install WireGuard Easy with the [docker run command](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/docker-run/) or via [podman](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/podman-nft/).

Now [setup a reverse proxy](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/basic-installation/#setup-reverse-proxy) to be able to access the Web UI securely from the internet. This step is optional, just make sure to follow the guide [here](https://wg-easy.github.io/wg-easy/latest/examples/tutorials/reverse-proxyless/) if you decide not to do it.

## Blocky DNS & Metrics

This fork bundles Blocky (DNS resolver with ad/tracker blocking), a DNS query history viewer, and VictoriaMetrics (time-series metrics) into the **same container** as WireGuard Easy. All services run inside one container via s6-overlay and are managed from a single `docker-compose` service (`wg-easy-blocky`). No separate containers are required.

Three additional admin pages are available in the Web UI:

- **Blocky DNS** - manage the Blocky configuration (ad/tracker blocking, upstream DNS servers, etc.) from the Web UI. The config is persisted in the wg-easy SQLite database (`blocky_config_table`) and applied by writing the YAML to the Blocky config file (`BLOCKY_CONFIG`, default `/etc/blocky/config.yml`) and restarting the Blocky service. The config is also synced once at wg-easy startup.
- **DNS History** - browse and search raw DNS query logs, parsed from the tab-separated CSV query log files (one per day) that Blocky writes to `BLOCKY_LOG_DIR` (default `/data/blocky/logs`).
- **Metrics** - dashboard cards and per-peer stats backed by VictoriaMetrics, which scrapes wg-easy's Prometheus metrics (`wireguard_*`) and Blocky metrics. VMUI is embedded via an authenticated proxy route.

When Blocky is enabled, generated client configs use the WireGuard server's tunnel IP as DNS, so all client DNS traffic is routed through Blocky.

### Published Ports

| Port      | Protocol       | Service                  |
| --------- | -------------- | ------------------------ |
| `53`      | udp + tcp      | Blocky DNS               |
| `4000`    | tcp            | Blocky HTTP API/Metrics  |
| `8428`    | tcp            | VictoriaMetrics/VMUI     |

### Blocky Environment Variables

| Env                | Default                   | Description                        |
| ------------------ | ------------------------- | ---------------------------------- |
| `BLOCKY_ENABLED`   | `true`                    | Enables the Blocky service         |
| `BLOCKY_HOST`      | `127.0.0.1`               | Blocky listen address              |
| `BLOCKY_CONFIG`    | `/etc/blocky/config.yml`  | Path to the Blocky config file     |
| `BLOCKY_LOG_DIR`   | `/data/blocky/logs`       | Directory where Blocky writes CSV query logs |
| `BLOCKY_HTTP_PORT` | `4000`                    | Blocky HTTP API/Metrics port       |

### VictoriaMetrics Environment Variables

| Env                    | Default                      | Description                             |
| ---------------------- | ---------------------------- | --------------------------------------- |
| `VM_ENABLED`           | `true`                       | Enables the VictoriaMetrics service     |
| `VM_URL`               | `http://127.0.0.1:8428`      | VictoriaMetrics API URL                 |
| `VMUI_URL`             | `http://127.0.0.1:8428/vmui` | VMUI dashboard URL                      |
| `VM_DATA_DIR`          | `/data/victoriametrics`      | Directory for metrics data              |
| `VM_RETENTION_PERIOD`  | `30d`                        | Metrics retention period               |
| `VM_HTTP_LISTEN_ADDR`  | `:8428`                      | VictoriaMetrics HTTP listen address     |
| `VM_METRICS_TOKEN`     | `—`                          | Bearer token for scraping wg-easy's `/metrics` (must match the wg-easy metrics password when set) |

## Contributors

- [paradox-sp](https://github.com/paradox-sp) — Blocky DNS filtering, DNS query history, VictoriaMetrics monitoring, Docker packaging

## Donate

Are you enjoying this project? Consider donating.

Founder: [Buy Emile a beer!](https://github.com/sponsors/WeeJeWel) 🍻

Maintainer: [Buy kaaax0815 a coffee!](https://github.com/sponsors/kaaax0815) ☕

## Development

### Prerequisites

- Docker
- Node LTS & corepack enabled
- Visual Studio Code

### Dev Server

This starts the development server with docker

```shell
pnpm dev
```

### Update Auto Imports

If you add something that should be auto-importable and VSCode complains, run:

```shell
cd src
pnpm install
cd ..
```

### Test Cli

This starts the cli with docker

```shell
pnpm cli:dev
```

## License

This project is licensed under the AGPL-3.0-only License - see the [LICENSE](LICENSE) file for details

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Jason A. Donenfeld, ZX2C4 or Edge Security

"WireGuard" and the "WireGuard" logo are registered trademarks of Jason A. Donenfeld
