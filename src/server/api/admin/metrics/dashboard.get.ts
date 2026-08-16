import VictoriaMetrics from '#server/utils/victoriaMetrics';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler('admin', 'any', async () => {
  const [vpnTraffic, dnsStats, peerStats] = await Promise.all([
    VictoriaMetrics.getVpnTraffic(),
    VictoriaMetrics.getDnsStats(),
    VictoriaMetrics.getPeerStats(),
  ]);

  return {
    success: true,
    vpnTraffic: vpnTraffic ?? { rx: 0, tx: 0 },
    dnsStats: dnsStats ?? {
      queriesPerSec: 0,
      blockedPerSec: 0,
      cacheHitRate: 0,
    },
    peerStats: peerStats ?? [],
  };
});
