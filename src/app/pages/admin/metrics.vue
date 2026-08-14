<template>
  <main>
    <div class="mb-6">
      <h2 class="text-xl font-medium text-gray-800 dark:text-neutral-100">
        {{ t('admin.metrics.title') }}
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        {{ t('admin.metrics.description') }}
      </p>
    </div>

    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UiStatCard
        :title="t('admin.metrics.vpnRx')"
        :value="formatBytes(store.dashboard?.vpnTraffic?.rx)"
      />
      <UiStatCard
        :title="t('admin.metrics.vpnTx')"
        :value="formatBytes(store.dashboard?.vpnTraffic?.tx)"
      />
      <UiStatCard
        :title="t('admin.metrics.dnsQps')"
        :value="formatQps(store.dashboard?.dnsStats?.queriesPerSec)"
      />
      <UiStatCard
        :title="t('admin.metrics.dnsBlocked')"
        :value="formatQps(store.dashboard?.dnsStats?.blockedPerSec)"
        color="red"
      />
    </div>

    <!-- Peer Statistics Table -->
    <div class="mb-6 overflow-hidden rounded-lg bg-white shadow-sm dark:bg-neutral-700">
      <div class="border-b border-gray-100 px-4 py-3 dark:border-neutral-600">
        <h3 class="text-lg font-medium text-gray-800 dark:text-neutral-100">
          {{ t('admin.metrics.peerStats') }}
        </h3>
      </div>

      <div
        v-if="store.loading && !store.dashboard"
        class="flex items-center justify-center py-8"
      >
        <IconsLoading class="mx-auto w-6 animate-spin text-gray-400" />
      </div>

      <div
        v-else-if="!store.dashboard?.peerStats || store.dashboard.peerStats.length === 0"
        class="py-8 text-center text-gray-500 dark:text-neutral-400"
      >
        {{ t('admin.dnsHistory.noResults') }}
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-gray-100 dark:border-neutral-600">
              <th class="px-4 py-2 font-medium text-gray-500 dark:text-neutral-400">
                {{ t('admin.metrics.peer') }}
              </th>
              <th class="px-4 py-2 font-medium text-gray-500 dark:text-neutral-400">
                {{ t('admin.metrics.rx') }}
              </th>
              <th class="px-4 py-2 font-medium text-gray-500 dark:text-neutral-400">
                {{ t('admin.metrics.tx') }}
              </th>
              <th class="px-4 py-2 font-medium text-gray-500 dark:text-neutral-400">
                {{ t('admin.metrics.lastHandshake') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(peer, i) in store.dashboard?.peerStats"
              :key="i"
              class="border-b border-gray-50 last:border-b-0 dark:border-neutral-600/50"
            >
              <td class="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-neutral-300">
                {{ peer.name }}
              </td>
              <td class="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-neutral-300">
                {{ formatBytes(peer.rx) }}
              </td>
              <td class="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-neutral-300">
                {{ formatBytes(peer.tx) }}
              </td>
              <td class="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-neutral-300">
                {{ peer.lastHandshake ? formatTimestamp(peer.lastHandshake) : t('admin.metrics.never') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- VMUI Embed -->
    <div class="mb-6">
      <h3 class="mb-3 text-lg font-medium text-gray-800 dark:text-neutral-100">
        {{ t('admin.metrics.vmui') }}
      </h3>
      <AdminMetricsEmbed />
    </div>
  </main>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useMetricsStore();

onMounted(async () => {
  await store.fetchDashboard();
});

function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '-';
  if (bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${value} ${units[i]}`;
}

function formatQps(v?: number | null): string {
  if (v == null) return '-';
  return `${v.toFixed(1)} /s`;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleString();
}
</script>
