import WireGuard from '#server/utils/WireGuard';
import { defineMetricsHandler } from '#server/utils/handler';
import { collectPeerStats } from '#server/utils/prometheus';

export default defineMetricsHandler('json', async () => {
  return getMetricsJSON();
});

async function getMetricsJSON() {
  const clients = await WireGuard.getAllClients();
  const { configured, enabled, connected } = collectPeerStats(clients);
  return {
    wireguard_configured_peers: configured,
    wireguard_enabled_peers: enabled,
    wireguard_connected_peers: connected,
    clients: clients.map((client) => ({
      name: client.name,
      enabled: client.enabled,
      ipv4Address: client.ipv4Address,
      ipv6Address: client.ipv6Address,
      publicKey: client.publicKey,
      endpoint: client.endpoint,
      latestHandshakeAt: client.latestHandshakeAt,
      transferRx: client.transferRx,
      transferTx: client.transferTx,
    })),
  };
}
