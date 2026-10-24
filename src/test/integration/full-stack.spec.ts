import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BASE = 'http://localhost:51821';

// Resolve the compose file relative to this spec so the test works no matter
// which directory vitest is invoked from (a bare relative path would break
// when running from src/).
const COMPOSE_FILE = fileURLToPath(
  new URL('../../../docker-compose.dev.yml', import.meta.url)
).replace(/\\/g, '/');

// Dev credentials come from INIT_USERNAME / INIT_PASSWORD in
// docker-compose.dev.yml. Override via WG_EASY_USERNAME / WG_EASY_PASSWORD.
const USERNAME = process.env.WG_EASY_USERNAME ?? 'testtest';
const PASSWORD = process.env.WG_EASY_PASSWORD ?? 'Qweasdyxcv!2';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cookie: string;

/**
 * Log in via the password endpoint and return the session cookie
 * ("wg-easy=<value>") extracted from the Set-Cookie header.
 *
 * The admin endpoints use definePermissionEventHandler -> getCurrentUser,
 * which returns 401 without a valid session, so every /api/admin/* request
 * must carry this cookie.
 */
async function login(): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
      remember: true,
    }),
    redirect: 'manual',
  });

  const body = await response.text();
  const data = JSON.parse(body) as { status?: string };
  const setCookie = response.headers.get('set-cookie');

  if (!response.ok || data.status !== 'success' || !setCookie) {
    throw new Error(
      `Login failed (${response.status}): ${body} (set-cookie: ${setCookie})`
    );
  }

  // Strip cookie attributes (Path, HttpOnly, SameSite, ...) and keep only the
  // "wg-easy=<value>" pair.
  const sessionCookie = setCookie.split(';')[0]!.trim();
  if (!sessionCookie) {
    throw new Error(`Login response cookie is empty: ${setCookie}`);
  }
  return sessionCookie;
}

/** GET an admin endpoint with the session cookie attached. */
async function authedGet(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
  });
}

async function waitForStoredMetric(metric: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastResult = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await authedGet(
        `/api/admin/metrics/proxy/api/v1/query?query=${encodeURIComponent(metric)}&nocache=1`
      );
      const body = await response.text();
      lastResult = `${response.status}: ${body}`;
      if (response.ok) {
        const data = JSON.parse(body) as {
          data?: { result?: unknown[] };
        };
        if (data.data?.result?.length) return;
      }
    } catch (error) {
      lastResult = String(error);
    }
    await sleep(1_000);
  }

  throw new Error(
    `VictoriaMetrics did not store ${metric} within 60s (${lastResult})`
  );
}

describe('Full Stack Integration', () => {
  beforeAll(async () => {
    execSync(`docker compose -f "${COMPOSE_FILE}" up -d --build`, {
      stdio: 'inherit',
      timeout: 300000,
    });

    // Give the containers time to boot before probing them.
    await sleep(30000);

    cookie = await login();
  }, 600000);

  afterAll(() => {
    execSync(`docker compose -f "${COMPOSE_FILE}" down -v`, {
      stdio: 'inherit',
    });
  }, 120000);

  it('should have wg-easy API responding', async () => {
    const response = await fetch(`${BASE}/api/information`);
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.currentRelease).toBeDefined();
  }, 30000);

  it('should keep Blocky and VictoriaMetrics HTTP endpoints private', async () => {
    await expect(
      fetch('http://localhost:4000/blocking/status', {
        signal: AbortSignal.timeout(1_000),
      })
    ).rejects.toThrow();
    await expect(
      fetch('http://localhost:8428/metrics', {
        signal: AbortSignal.timeout(1_000),
      })
    ).rejects.toThrow();
  }, 30000);

  it('should expose Blocky status through the authenticated admin API', async () => {
    const response = await authedGet('/api/admin/blocky/status');
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.status).toBeDefined();
  }, 30000);

  it('should expose VictoriaMetrics through the authenticated admin proxy', async () => {
    const response = await authedGet('/api/admin/metrics/proxy/metrics');
    expect(response.ok).toBe(true);
    const text = await response.text();
    expect(text).toContain('victoriametrics');
  }, 30000);

  it('should scrape wg-easy and Blocky metrics', async () => {
    await Promise.all([
      waitForStoredMetric('wireguard_configured_peers'),
      waitForStoredMetric('blocky_build_info'),
    ]);
  }, 70000);

  it('should serve embeddable VMUI through the authenticated proxy', async () => {
    const response = await authedGet('/api/admin/metrics/vmui/');
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(await response.text()).toContain('<html');
  }, 30000);

  it('should have Blocky config API working', async () => {
    const response = await authedGet('/api/admin/blocky/config');
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.config).toBeDefined();
  }, 30000);

  it('should have DNS history API working', async () => {
    const response = await authedGet('/api/admin/dns-history');
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.queries).toBeDefined();
  }, 30000);

  it('should have Metrics dashboard API working', async () => {
    const response = await authedGet('/api/admin/metrics/dashboard');
    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('vpnTraffic');
    expect(data).toHaveProperty('dnsStats');
    expect(data).toHaveProperty('peerStats');
  }, 30000);
});
