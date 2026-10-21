<template>
  <main>
    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <UiStatCard
        :title="t('admin.dnsHistory.totalQueries')"
        :value="formatNumber(store.stats?.totalQueries)"
      />
      <UiStatCard
        :title="t('admin.dnsHistory.blockedQueries')"
        :value="formatNumber(store.stats?.blockedQueries)"
        color="red"
      />
      <UiStatCard
        :title="t('admin.dnsHistory.allowedQueries')"
        :value="formatNumber(store.stats?.allowedQueries)"
      />
      <UiStatCard
        :title="t('admin.dnsHistory.uniqueClients')"
        :value="formatNumber(store.stats?.uniqueClients)"
      />
    </div>

    <AdminDnsHistoryTable />
  </main>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useDnsHistoryStore();

onMounted(async () => {
  await store.fetchStats();
});

function formatNumber(n?: number | null): string {
  if (n == null) return '-';
  return n.toLocaleString();
}
</script>
