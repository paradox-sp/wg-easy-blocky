<template>
  <main>
    <div
      v-if="connectedPeers != null || metricsStore.dashboard"
      class="mx-3 mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <UiStatCard
        v-if="connectedPeers != null"
        :title="$t('pages.dashboard.connectedPeers')"
        :value="String(connectedPeers)"
      />
      <UiStatCard
        v-if="metricsStore.dashboard?.vpnTraffic"
        :title="$t('pages.dashboard.vpnTraffic')"
        :value="`${formatBytes(metricsStore.dashboard.vpnTraffic.rx)} / ${formatBytes(metricsStore.dashboard.vpnTraffic.tx)}`"
      />
      <UiStatCard
        v-if="globalStore.blockyEnabled && metricsStore.dashboard?.dnsStats"
        :title="$t('pages.dashboard.dnsQueries')"
        :value="`${(metricsStore.dashboard.dnsStats.queriesPerSec ?? 0).toFixed(1)} /s`"
      />
      <UiStatCard
        v-if="globalStore.blockyEnabled && metricsStore.dashboard?.dnsStats"
        :title="$t('pages.dashboard.blockedQueries')"
        :value="`${(metricsStore.dashboard.dnsStats.blockedPerSec ?? 0).toFixed(1)} /s`"
        color="red"
      />
    </div>

    <Panel>
      <PanelHead>
        <PanelHeadTitle>
          {{ $t('pages.clients') }}
        </PanelHeadTitle>
        <PanelHeadBoat>
          <ClientsSearch />
          <div class="flex gap-2">
            <ClientsSort />
            <ClientsNew />
          </div>
        </PanelHeadBoat>
      </PanelHead>

      <div>
        <ClientsList
          v-if="clientsStore.clients && clientsStore.clients.length > 0"
        />
      </div>
      <ClientsEmpty
        v-if="clientsStore.clients && clientsStore.clients.length === 0"
      />
      <div
        v-if="clientsStore.clients === null"
        class="p-5 text-gray-200 dark:text-red-300"
      >
        <IconsLoading class="mx-auto w-5 animate-spin" />
      </div>
    </Panel>
  </main>
</template>

<script setup lang="ts">
const globalStore = useGlobalStore();
const clientsStore = useClientsStore();
const metricsStore = useMetricsStore();

// TODO?: use hover card to show more detailed info without leaving the page
// or do something like a accordion

const initialRefresh = clientsStore.refresh();
let pageMounted = false;

const { pause: pausePolling, resume: resumePolling } = useTimeoutPoll(
  async () => {
    try {
      await clientsStore.refresh({
        updateCharts: globalStore.uiShowCharts,
      });
    } catch (error) {
      console.error(error);
    }

    metricsStore.fetchDashboard().catch(console.error);
  },
  5000,
  { immediate: false }
);

function handleVisibilityChange() {
  if (document.hidden) {
    pausePolling();
  } else {
    // refresh immediately on return, then resume the interval
    clientsStore
      .refresh({
        updateCharts: globalStore.uiShowCharts,
      })
      .catch(console.error);
    metricsStore.fetchDashboard().catch(console.error);
    resumePolling();
  }
}

onMounted(() => {
  pageMounted = true;
  document.addEventListener('visibilitychange', handleVisibilityChange);

  void initialRefresh.catch(console.error).finally(() => {
    if (pageMounted) {
      resumePolling();
    }
  });
});

onUnmounted(() => {
  pageMounted = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

const connectedPeers = computed(() => {
  if (!clientsStore.clients) return null;
  return clientsStore.clients.filter((c) => c.latestHandshakeAt != null).length;
});

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '0 B';
  if (bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${value} ${units[i]}`;
}
</script>
