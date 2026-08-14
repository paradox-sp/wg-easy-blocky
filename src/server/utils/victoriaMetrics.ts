import { createDebug } from 'obug';

import { VICTORIA_METRICS_ENV } from '#server/utils/config';

const VM_DEBUG = createDebug('VictoriaMetrics');

interface QueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
}

class VictoriaMetrics {
  #baseUrl: string;

  constructor() {
    this.#baseUrl = VICTORIA_METRICS_ENV.URL;
  }

  async query(query: string, time?: number): Promise<QueryResult | null> {
    if (!VICTORIA_METRICS_ENV.ENABLED) return null;

    try {
      const params = new URLSearchParams({ query });
      if (time) params.append('time', String(time));

      const response = await fetch(`${this.#baseUrl}/api/v1/query?${params}`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      VM_DEBUG('Query failed:', error);
      return null;
    }
  }

  async queryRange(
    query: string,
    start: number,
    end: number,
    step: number
  ): Promise<QueryResult | null> {
    if (!VICTORIA_METRICS_ENV.ENABLED) return null;

    try {
      const params = new URLSearchParams({
        query,
        start: String(start),
        end: String(end),
        step: String(step),
      });

      const response = await fetch(
        `${this.#baseUrl}/api/v1/query_range?${params}`
      );
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      VM_DEBUG('Query range failed:', error);
      return null;
    }
  }

  async getMetrics(): Promise<string | null> {
    if (!VICTORIA_METRICS_ENV.ENABLED) return null;

    try {
      const response = await fetch(`${this.#baseUrl}/metrics`);
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  getVMUIUrl(): string {
    return VICTORIA_METRICS_ENV.VMUI_URL;
  }

  // Predefined queries for dashboard
  async getVpnTraffic(): Promise<{ rx: number; tx: number } | null> {
    const [rxResult, txResult] = await Promise.all([
      this.query('sum(rate(wireguard_received_bytes[5m]))'),
      this.query('sum(rate(wireguard_sent_bytes[5m]))'),
    ]);
    if (!rxResult?.data?.result?.length && !txResult?.data?.result?.length) {
      return null;
    }

    const rx = Number(rxResult?.data?.result?.[0]?.value?.[1]) || 0;
    const tx = Number(txResult?.data?.result?.[0]?.value?.[1]) || 0;
    return { rx, tx };
  }

  async getDnsStats(): Promise<{
    queriesPerSec: number;
    blockedPerSec: number;
    cacheHitRate: number;
  } | null> {
    const [qpsResult, bpsResult, cacheHitsResult, cacheMissesResult] =
      await Promise.all([
        this.query('sum(rate(blocky_query_total[5m]))'),
        this.query(
          'sum(rate(blocky_response_total{response_type="BLOCKED"}[5m]))'
        ),
        this.query('sum(rate(blocky_cache_hits_total[5m]))'),
        this.query('sum(rate(blocky_cache_misses_total[5m]))'),
      ]);
    if (
      !qpsResult?.data?.result?.length &&
      !bpsResult?.data?.result?.length
    ) {
      return null;
    }

    const cacheHits =
      Number(cacheHitsResult?.data?.result?.[0]?.value?.[1]) || 0;
    const cacheMisses =
      Number(cacheMissesResult?.data?.result?.[0]?.value?.[1]) || 0;

    return {
      queriesPerSec: Number(qpsResult?.data?.result?.[0]?.value?.[1]) || 0,
      blockedPerSec: Number(bpsResult?.data?.result?.[0]?.value?.[1]) || 0,
      cacheHitRate: (cacheHits + cacheMisses) === 0 ? 0 : cacheHits / (cacheHits + cacheMisses),
    };
  }

  async getPeerStats(): Promise<
    Array<{
      name: string;
      rx: number;
      tx: number;
      lastHandshake: number;
    }> | null
  > {
    const result = await this.query(
      '{__name__=~"wireguard_(received_bytes|sent_bytes|latest_handshake_seconds)"}'
    );
    if (!result?.data?.result?.length) return null;

    // Group by peer name
    const peers = new Map<
      string,
      { rx: number; tx: number; lastHandshake: number }
    >();
    for (const series of result.data.result) {
      const name = series.metric.name || series.metric.peer || 'unknown';
      const peer = peers.get(name) || { rx: 0, tx: 0, lastHandshake: 0 };
      if (series.metric.__name__?.includes('received'))
        peer.rx = Number(series.value[1]) || 0;
      if (series.metric.__name__?.includes('sent'))
        peer.tx = Number(series.value[1]) || 0;
      if (series.metric.__name__?.includes('handshake'))
        peer.lastHandshake = Number(series.value[1]) || 0;
      peers.set(name, peer);
    }

    return Array.from(peers.entries()).map(([name, data]) => ({
      name,
      ...data,
    }));
  }
}

export default new VictoriaMetrics();
