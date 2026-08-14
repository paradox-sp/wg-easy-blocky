import { defineStore } from 'pinia';

export interface VpnTraffic {
  rx: number;
  tx: number;
}

export interface DnsStats {
  queriesPerSec: number;
  blockedPerSec: number;
  cacheHitRate: number;
}

export interface PeerStat {
  name: string;
  rx: number;
  tx: number;
  lastHandshake: number;
}

export interface DashboardData {
  vpnTraffic: VpnTraffic | null;
  dnsStats: DnsStats | null;
  peerStats: PeerStat[];
}

export const useMetricsStore = defineStore('Metrics', () => {
  const dashboard = ref<DashboardData>({
    vpnTraffic: null,
    dnsStats: null,
    peerStats: [],
  });
  const vmuiUrl = ref<string>('/api/admin/metrics/vmui/');
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDashboard() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ success: boolean } & DashboardData>(
        '/api/admin/metrics/dashboard'
      );
      dashboard.value = {
        vpnTraffic: data.vpnTraffic ?? null,
        dnsStats: data.dnsStats ?? null,
        peerStats: data.peerStats ?? [],
      };
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch dashboard metrics';
    } finally {
      loading.value = false;
    }
  }

  function fetchVMUIUrl() {
    // The iframe src must go through the auth-protected proxy, never the
    // raw internal VictoriaMetrics URL, so keep the proxy path.
    vmuiUrl.value = '/api/admin/metrics/vmui/';
  }

  return {
    dashboard: readonly(dashboard),
    vmuiUrl: readonly(vmuiUrl),
    loading: readonly(loading),
    error: readonly(error),
    fetchDashboard,
    fetchVMUIUrl,
  };
});
