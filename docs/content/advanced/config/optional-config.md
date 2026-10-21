---
title: Optional Configuration
---

You can set these environment variables to configure the container. They are not required, but can be useful in some cases.

| Env                     | Default   | Example                     | Description                                                     |
| ----------------------- | --------- | --------------------------- | --------------------------------------------------------------- |
| `PORT`                  | `51821`   | `6789`                      | TCP port for Web UI.                                            |
| `HOST`                  | `0.0.0.0` | `localhost`                 | IP address web UI binds to.                                     |
| `INSECURE`              | `false`   | `true`                      | If access over http is allowed                                  |
| `DISABLE_IPV6`          | `false`   | `true`                      | If IPv6 support should be disabled                              |
| `DISABLE_VERSION_CHECK` | `false`   | `true`                      | If wg-easy should check for new updates                         |
| `TRUSTED_PROXIES`       |           | `172.18.0.2,fd00:1234::/64` | Proxy IP addresses or CIDRs allowed to forward request metadata |
| `WG_INTERFACE`          | `wg0`     | `wg1`                       | Name of the WireGuard interface                                 |

/// note | IPv6 Caveats

Disabling IPv6 will disable the creation of the default IPv6 firewall rules and won't add a IPv6 address to the interface and clients.

You will however still see a IPv6 address in the Web UI, but it won't be used.

This option can be removed in the future, as more devices support IPv6.

///

## Trusted Proxies

Set `TRUSTED_PROXIES` when wg-easy runs behind a reverse proxy and needs to use
the original host. Multiple IPv4 or IPv6 addresses and CIDRs can be provided as
a comma-separated list:

```yaml
environment:
    - TRUSTED_PROXIES=172.18.0.2,fd00:1234::/64
```

Only add the source addresses used by your reverse proxy. wg-easy only uses
`X-Forwarded-Host` and `X-Forwarded-For` when the request comes from one of
these addresses. The forwarded client address is included in security logs so
that tools such as CrowdSec can identify failed authentication attempts. The
request protocol remains controlled by `INSECURE`. Invalid addresses prevent
wg-easy from starting so that configuration errors are not silently ignored.
Restart the container after changing this setting.

## Authentication Throttling

Password, HTTP Basic, and two-factor authentication are protected by an
in-memory adaptive throttle. Five failures for one identity and client IP, or
20 failures from one client IP across identities, trigger a 30-second cooldown.
Each failure after a cooldown doubles the delay up to 15 minutes. Failure
counters expire after 15 minutes without another failure and successful
authentication clears the relevant counters.

Throttle state is local to the running process and resets when the container
restarts. When a reverse proxy is used, configure `TRUSTED_PROXIES` correctly
so throttling uses the forwarded client address instead of grouping every
request under the proxy address.

## WireGuard Interface

Set `WG_INTERFACE` to specify a custom interface name, useful if you are running multiple wg-easy instances on the same host with `network_mode: host`:

```yaml
environment:
    - WG_INTERFACE=wg1
```
