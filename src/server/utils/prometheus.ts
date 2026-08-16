import { isPeerConnected } from '#shared/utils/time';

export function escapePrometheusLabelValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll('"', '\\"');
}

export function formatPrometheusLabels(
  labels: Record<string, string | number | boolean>
): string {
  return Object.entries(labels)
    .map(
      ([name, value]) =>
        `${name}="${escapePrometheusLabelValue(String(value))}"`
    )
    .join(',');
}

export type PeerStats = {
  configured: number;
  enabled: number;
  connected: number;
};

/**
 * Count configured/enabled/connected peers once, shared by the prometheus
 * and json metrics endpoints so the loop can't drift apart.
 */
export function collectPeerStats(
  clients: Array<{ enabled: boolean; latestHandshakeAt: Date | null }>
): PeerStats {
  let enabled = 0;
  let connected = 0;

  for (const client of clients) {
    if (client.enabled) enabled++;
    if (isPeerConnected(client)) connected++;
  }

  return { configured: clients.length, enabled, connected };
}
