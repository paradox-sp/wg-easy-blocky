<template>
  <main>
    <div
      v-if="hasDashboardSummary"
      class="container mx-auto mb-4 grid max-w-3xl grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4 px-3"
    >
      <UiStatCard
        v-if="connectedPeers != null"
        :title="$t('pages.dashboard.connectedPeers')"
        :value="`${connectedPeers} / ${totalPeers}`"
      />
      <UiStatCard
        v-if="canViewMetrics && metricsStore.dashboard.vpnTraffic"
        :title="$t('pages.dashboard.vpnTraffic')"
        :value="`↓ ${formatRate(metricsStore.dashboard.vpnTraffic.rx)} · ↑ ${formatRate(metricsStore.dashboard.vpnTraffic.tx)}`"
      />
      <UiStatCard
        v-if="
          canViewMetrics &&
          globalStore.blockyEnabled &&
          metricsStore.dashboard.dnsStats
        "
        :title="$t('pages.dashboard.dnsQueries')"
        :value="`${(metricsStore.dashboard.dnsStats.queriesPerSec ?? 0).toFixed(1)} /s`"
      />
      <UiStatCard
        v-if="
          canViewMetrics &&
          globalStore.blockyEnabled &&
          metricsStore.dashboard.dnsStats
        "
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
        <PanelHeadBoat class="w-full sm:w-auto">
          <ClientsSearch class="w-full sm:w-auto" />
          <div class="flex w-full justify-end gap-2 sm:w-auto">
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
const authStore = useAuthStore();
const clientsStore = useClientsStore();
const metricsStore = useMetricsStore();
const configuredDashboardPollIntervalMs = Number(
  useRuntimeConfig().public.dashboardPollIntervalMs
);
const dashboardPollIntervalMs =
  Number.isSafeInteger(configuredDashboardPollIntervalMs) &&
  configuredDashboardPollIntervalMs >= 1_000
    ? configuredDashboardPollIntervalMs
    : 10_000;
const canViewMetrics = computed(() => {
  const user = authStore.userData;
  return (
    globalStore.victoriaMetricsEnabled &&
    user !== null &&
    hasPermissions(user, 'admin', 'any')
  );
});

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

    await refreshMetrics();
  },
  dashboardPollIntervalMs,
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
    refreshMetrics().catch(console.error);
    resumePolling();
  }
}

onMounted(() => {
  pageMounted = true;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  refreshMetrics().catch(console.error);

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
const totalPeers = computed(() => clientsStore.clients?.length ?? 0);
const hasDashboardSummary = computed(
  () =>
    connectedPeers.value !== null ||
    (canViewMetrics.value &&
      (metricsStore.dashboard.vpnTraffic !== null ||
        (globalStore.blockyEnabled &&
          metricsStore.dashboard.dnsStats !== null)))
);

function refreshMetrics() {
  if (!canViewMetrics.value) return Promise.resolve();
  return metricsStore.fetchDashboard();
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '0 B';
  if (bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${value} ${units[i]}`;
}

function formatRate(bytes?: number | null): string {
  return `${formatBytes(bytes)}/s`;
}
</script>
