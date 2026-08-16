import { describe, expect, test } from 'vitest';

import {
  collectPeerStats,
  escapePrometheusLabelValue,
  formatPrometheusLabels,
} from '#server/utils/prometheus';

describe('Prometheus label formatting', () => {
  test('escapes quotes, backslashes, and newlines in label values', () => {
    expect(escapePrometheusLabelValue('vpn"client')).toBe('vpn\\"client');
    expect(escapePrometheusLabelValue('path\\client')).toBe('path\\\\client');
    expect(escapePrometheusLabelValue('line one\nline two')).toBe(
      'line one\\nline two'
    );
  });

  test('formats escaped values without changing scalar values', () => {
    expect(
      formatPrometheusLabels({
        interface: 'wg"0',
        enabled: true,
        name: 'home\\office\npeer',
      })
    ).toBe('interface="wg\\"0",enabled="true",name="home\\\\office\\npeer"');
  });
});

describe('collectPeerStats', () => {
  test('counts configured, enabled, and connected peers', () => {
    const clients = [
      { enabled: true, latestHandshakeAt: new Date() },
      {
        enabled: true,
        // Older than the 10-minute connected window.
        latestHandshakeAt: new Date(Date.now() - 11 * 60 * 1000),
      },
      // isPeerConnected only checks handshake recency, not the enabled flag
      // (mirrors the original endpoint loops).
      { enabled: false, latestHandshakeAt: new Date() },
      { enabled: false, latestHandshakeAt: null },
    ];

    expect(collectPeerStats(clients)).toEqual({
      configured: 4,
      enabled: 2,
      connected: 2,
    });
  });

  test('handles an empty peer list', () => {
    expect(collectPeerStats([])).toEqual({
      configured: 0,
      enabled: 0,
      connected: 0,
    });
  });
});
