<template>
  <main>
    <div class="mb-6">
      <h2 class="text-xl font-medium text-gray-800 dark:text-neutral-100">
        {{ t('admin.blocky.title') }}
      </h2>
      <p class="mt-1 text-sm text-gray-500 dark:text-neutral-400">
        {{ t('admin.blocky.description') }}
      </p>
    </div>

    <div
      v-if="store.status"
      class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <UiStatCard
        :title="t('admin.blocky.status')"
        :value="store.status.enabled ? t('admin.blocky.enabled') : t('admin.blocky.disabled')"
        :color="store.status.enabled ? undefined : 'red'"
      />
      <UiStatCard
        v-if="!store.status.enabled && store.status.autoEnableInSec != null"
        :title="t('admin.blocky.autoEnableIn')"
        :value="formatAutoEnable(store.status.autoEnableInSec)"
      />
      <UiStatCard
        v-if="store.status.disabledGroups && store.status.disabledGroups.length > 0"
        :title="t('admin.blocky.disabledGroups')"
        :value="store.status.disabledGroups.join(', ')"
      />
    </div>

    <div
      v-if="store.loading && !store.config"
      class="flex items-center justify-center py-8"
    >
      <IconsLoading class="mx-auto w-6 animate-spin text-gray-400" />
    </div>

    <AdminBlockyConfigForm />
  </main>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useBlockyStore();

onMounted(async () => {
  await Promise.all([store.fetchConfig(), store.fetchStatus()]);
});

function formatAutoEnable(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
</script>
