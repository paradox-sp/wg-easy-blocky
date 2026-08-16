<template>
  <div
    class="w-full overflow-hidden rounded-lg border border-gray-100 dark:border-neutral-600"
  >
    <IconsLoading
      v-if="loading"
      class="mx-auto my-8 w-6 animate-spin text-gray-400"
    />
    <iframe
      v-else-if="store.vmuiUrl"
      :src="store.vmuiUrl"
      class="h-[80vh] w-full border-0"
      title="VMUI Metrics"
    />
    <div
      v-else
      class="flex items-center justify-center py-8 text-gray-500 dark:text-neutral-400"
    >
      {{ t('admin.metrics.vmui') }}
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useMetricsStore();
const loading = ref(true);

onMounted(async () => {
  await store.fetchVMUIUrl();
  loading.value = false;
});
</script>
