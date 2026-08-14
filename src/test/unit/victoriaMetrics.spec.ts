import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import VictoriaMetrics from '#server/utils/victoriaMetrics';

const mockVictoriaMetricsEnv = vi.hoisted(() => ({
  ENABLED: true,
  URL: 'http://127.0.0.1:8428',
  VMUI_URL: 'http://127.0.0.1:8428/vmui',
  DATA_DIR: '/data/victoriametrics',
  RETENTION_PERIOD: '30d',
  HTTP_LISTEN_ADDR: ':8428',
}));

// The singleton reads VICTORIA_METRICS_ENV.URL at construction time and
// VICTORIA_METRICS_ENV.ENABLED at call time. Mocking the config module also
// avoids the real one throwing on the missing PORT env var.
vi.mock('#server/utils/config', () => ({
  VICTORIA_METRICS_ENV: mockVictoriaMetricsEnv,
}));

const fetchMock = vi.fn();

function okJson(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  } as unknown as Response;
}

function okText(text: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => text,
  } as unknown as Response;
}

function vectorResult(
  result: Array<{ metric: Record<string, string>; value: [number, string] }>
) {
  return { status: 'success', data: { resultType: 'vector', result } };
}

beforeEach(() => {
  fetchMock.mockReset();
  mockVictoriaMetricsEnv.ENABLED = true;
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VictoriaMetrics', () => {
  test('query returns null when the integration is disabled', async () => {
    mockVictoriaMetricsEnv.ENABLED = false;

    await expect(VictoriaMetrics.query('up')).resolves.toBeNull();
    await expect(
      VictoriaMetrics.queryRange('up', 1, 2, 1)
    ).resolves.toBeNull();
    await expect(VictoriaMetrics.getMetrics()).resolves.toBeNull();
    await expect(VictoriaMetrics.getVpnTraffic()).resolves.toBeNull();
    await expect(VictoriaMetrics.getDnsStats()).resolves.toBeNull();
    await expect(VictoriaMetrics.getPeerStats()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('query returns the parsed response and appends the time parameter', async () => {
    const body = vectorResult([
      { metric: { __name__: 'up' }, value: [1720000000, '1'] },
    ]);
    fetchMock.mockImplementation(async () => okJson(body));

    await expect(VictoriaMetrics.query('up', 1720000000)).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8428/api/v1/query?query=up&time=1720000000'
    );
  });

  test('query returns null on non-OK responses and network errors', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(VictoriaMetrics.query('up')).resolves.toBeNull();

    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(VictoriaMetrics.query('up')).resolves.toBeNull();
  });

  test('queryRange passes start, end, and step parameters', async () => {
    fetchMock.mockImplementation(async () => okJson(vectorResult([])));

    await VictoriaMetrics.queryRange('rate(x[5m])', 1720000000, 1720000100, 15);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/query_range')
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('start=1720000000')
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('end=1720000100')
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('step=15'));
  });

  test('getMetrics returns the raw text body', async () => {
    fetchMock.mockImplementation(async () =>
      okText('go_gc_duration_seconds 0.001')
    );

    await expect(VictoriaMetrics.getMetrics()).resolves.toBe(
      'go_gc_duration_seconds 0.001'
    );
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8428/metrics');
  });

  test('getVMUIUrl returns the configured VMUI URL', () => {
    expect(VictoriaMetrics.getVMUIUrl()).toBe('http://127.0.0.1:8428/vmui');
  });

  test('getVpnTraffic parses rx and tx from parallel queries', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('wireguard_received_bytes')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'wireguard_received_bytes' },
              value: [1720000000, '1000'],
            },
          ])
        );
      }
      return okJson(
        vectorResult([
          {
            metric: { __name__: 'wireguard_sent_bytes' },
            value: [1720000000, '500'],
          },
        ])
      );
    });

    await expect(VictoriaMetrics.getVpnTraffic()).resolves.toEqual({
      rx: 1000,
      tx: 500,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('getVpnTraffic returns null when both queries have no results', async () => {
    fetchMock.mockImplementation(async () => okJson(vectorResult([])));

    await expect(VictoriaMetrics.getVpnTraffic()).resolves.toBeNull();
  });

  test('getVpnTraffic defaults a missing query to zero', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('wireguard_received_bytes')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'wireguard_received_bytes' },
              value: [1720000000, '1000'],
            },
          ])
        );
      }
      return okJson(vectorResult([]));
    });

    await expect(VictoriaMetrics.getVpnTraffic()).resolves.toEqual({
      rx: 1000,
      tx: 0,
    });
  });

  test('getDnsStats computes qps, blocked per second, and cache hit rate', async () => {
    // getDnsStats issues four parallel queries (victoriaMetrics.ts lines
    // 104-112): blocky_query_total, blocky_response_total{response_type="BLOCKED"},
    // blocky_cache_hits_total and blocky_cache_misses_total.
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('blocky_query_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_query_total' },
              value: [1720000000, '42'],
            },
          ])
        );
      }
      if (u.includes('blocky_response_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_response_total' },
              value: [1720000000, '7'],
            },
          ])
        );
      }
      if (u.includes('blocky_cache_hits_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_cache_hits_total' },
              value: [1720000000, '3'],
            },
          ])
        );
      }
      return okJson(
        vectorResult([
          {
            metric: { __name__: 'blocky_cache_misses_total' },
            value: [1720000000, '1'],
          },
        ])
      );
    });

    await expect(VictoriaMetrics.getDnsStats()).resolves.toEqual({
      queriesPerSec: 42,
      blockedPerSec: 7,
      // cacheHitRate = hits / (hits + misses) = 3 / (3 + 1)
      cacheHitRate: 0.75,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test('getDnsStats returns null when both the query and blocked rate results are empty', async () => {
    fetchMock.mockImplementation(async () => okJson(vectorResult([])));

    await expect(VictoriaMetrics.getDnsStats()).resolves.toBeNull();
  });

  test('getDnsStats keeps stats when only the blocked rate has results', async () => {
    // The null guard only triggers when BOTH the qps and bps results are
    // empty (victoriaMetrics.ts lines 113-118).
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('blocky_response_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_response_total' },
              value: [1720000000, '7'],
            },
          ])
        );
      }
      return okJson(vectorResult([]));
    });

    await expect(VictoriaMetrics.getDnsStats()).resolves.toEqual({
      queriesPerSec: 0,
      blockedPerSec: 7,
      cacheHitRate: 0,
    });
  });

  test('getDnsStats defaults missing rate values to zero', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('blocky_query_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_query_total' },
              value: [1720000000, '42'],
            },
          ])
        );
      }
      return okJson(vectorResult([]));
    });

    await expect(VictoriaMetrics.getDnsStats()).resolves.toEqual({
      queriesPerSec: 42,
      blockedPerSec: 0,
      cacheHitRate: 0,
    });
  });

  test('getDnsStats computes a full cache hit rate when misses are absent', async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('blocky_cache_hits_total')) {
        return okJson(
          vectorResult([
            {
              metric: { __name__: 'blocky_cache_hits_total' },
              value: [1720000000, '2'],
            },
          ])
        );
      }
      if (u.includes('blocky_cache_misses_total')) {
        return okJson(vectorResult([]));
      }
      return okJson(
        vectorResult([
          {
            metric: { __name__: 'blocky_query_total' },
            value: [1720000000, '10'],
          },
        ])
      );
    });

    await expect(VictoriaMetrics.getDnsStats()).resolves.toEqual({
      queriesPerSec: 10,
      blockedPerSec: 10,
      // hits=2, misses=0 -> 2 / (2 + 0)
      cacheHitRate: 1,
    });
  });

  test('getPeerStats groups series by peer name', async () => {
    const series = [
      {
        metric: { __name__: 'wireguard_received_bytes', name: 'alice' },
        value: [1720000000, '100'],
      },
      {
        metric: { __name__: 'wireguard_sent_bytes', name: 'alice' },
        value: [1720000000, '200'],
      },
      {
        metric: {
          __name__: 'wireguard_latest_handshake_seconds',
          name: 'alice',
        },
        value: [1720000000, '1234'],
      },
      {
        metric: { __name__: 'wireguard_received_bytes', name: 'bob' },
        value: [1720000000, '300'],
      },
      {
        metric: { __name__: 'wireguard_sent_bytes', name: 'bob' },
        value: [1720000000, '400'],
      },
    ];
    const expectedQuery =
      '{__name__=~"wireguard_(received_bytes|sent_bytes|latest_handshake_seconds)"}';
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (!decodeURIComponent(u).includes(expectedQuery)) {
        return okJson(vectorResult([]));
      }
      return okJson(vectorResult(series));
    });

    await expect(VictoriaMetrics.getPeerStats()).resolves.toEqual([
      { name: 'alice', rx: 100, tx: 200, lastHandshake: 1234 },
      { name: 'bob', rx: 300, tx: 400, lastHandshake: 0 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('getPeerStats falls back to the peer label and then unknown', async () => {
    const series = [
      {
        metric: { __name__: 'wireguard_received_bytes', peer: 'carol' },
        value: [1720000000, '10'],
      },
      {
        metric: { __name__: 'wireguard_received_bytes' },
        value: [1720000000, '99'],
      },
    ];
    const expectedQuery =
      '{__name__=~"wireguard_(received_bytes|sent_bytes|latest_handshake_seconds)"}';
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (!decodeURIComponent(u).includes(expectedQuery)) {
        return okJson(vectorResult([]));
      }
      return okJson(vectorResult(series));
    });

    await expect(VictoriaMetrics.getPeerStats()).resolves.toEqual([
      { name: 'carol', rx: 10, tx: 0, lastHandshake: 0 },
      { name: 'unknown', rx: 99, tx: 0, lastHandshake: 0 },
    ]);
  });

  test('getPeerStats returns null when no series are returned', async () => {
    fetchMock.mockImplementation(async () => okJson(vectorResult([])));

    await expect(VictoriaMetrics.getPeerStats()).resolves.toBeNull();
  });
});