<template>
  <div>
    <!-- Filters -->
    <div class="mb-4 flex flex-wrap items-end gap-3">
      <div class="flex flex-col gap-1">
        <FormLabel for="dns-search">{{
          t('admin.dnsHistory.search')
        }}</FormLabel>
        <div class="relative">
          <IconsMagnifyingGlass
            class="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-gray-400 dark:text-neutral-400"
          />
          <BaseInput
            id="dns-search"
            v-model="searchQuery"
            type="text"
            class="w-full pl-8 sm:w-64"
            :placeholder="t('admin.dnsHistory.searchPlaceholder')"
          />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <FormLabel for="dns-client">{{
          t('admin.dnsHistory.client')
        }}</FormLabel>
        <BaseSelect
          id="dns-client"
          v-model="selectedClient"
          :options="clientOptions"
        />
      </div>
      <div class="flex flex-col gap-1">
        <FormLabel for="dns-blocked">{{ t('admin.dnsHistory.all') }}</FormLabel>
        <BaseSelect
          id="dns-blocked"
          v-model="selectedBlocked"
          :options="blockedOptions"
        />
      </div>
      <div class="flex flex-col gap-1">
        <FormLabel for="dns-sort">{{ t('admin.dnsHistory.sort') }}</FormLabel>
        <BaseSelect
          id="dns-sort"
          v-model="selectedSort"
          :options="sortOptions"
        />
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="store.loading" class="flex items-center justify-center py-8">
      <IconsLoading class="mx-auto w-6 animate-spin text-gray-400" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!store.queries || store.queries.length === 0"
      class="py-8 text-center text-gray-500 dark:text-neutral-400"
    >
      {{ t('admin.dnsHistory.noResults') }}
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-gray-100 dark:border-neutral-600">
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.timestamp') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.client') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.type') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.domain') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.answer') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.reason') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.duration') }}
            </th>
            <th
              class="px-3 py-2 font-medium text-gray-500 dark:text-neutral-400"
            >
              {{ t('admin.dnsHistory.blocked') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(query, i) in store.queries"
            :key="i"
            class="border-b border-gray-50 last:border-b-0 dark:border-neutral-600/50"
          >
            <td
              class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ formatTimestamp(query.timestamp) }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.client
              }}{{ query.clientName ? ' (' + query.clientName + ')' : '' }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.type }}
            </td>
            <td
              class="max-w-48 truncate px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.domain }}
            </td>
            <td
              class="max-w-48 truncate px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.answer }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.reason }}
            </td>
            <td
              class="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-neutral-300"
            >
              {{ query.duration != null ? `${query.duration}ms` : '-' }}
            </td>
            <td class="px-3 py-2">
              <span
                :class="[
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  query.blocked
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
                ]"
              >
                {{
                  query.blocked
                    ? t('admin.dnsHistory.blocked')
                    : t('admin.dnsHistory.allowed')
                }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div
      v-if="store.total > 0"
      class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 dark:text-neutral-400"
    >
      <span>
        {{ t('admin.dnsHistory.showing') }}
        {{ (store.offset ?? 0) + 1 }}&ndash;{{
          Math.min((store.offset ?? 0) + (store.limit ?? 50), store.total)
        }}
        {{ t('admin.dnsHistory.of') }}
        {{ store.total.toLocaleString() }}
      </span>
      <div class="flex gap-2">
        <BaseSecondaryButton
          type="button"
          class="rounded-lg px-3 py-1 text-sm"
          :disabled="!store.offset || store.offset === 0"
          @click="prevPage"
        >
          {{ t('admin.dnsHistory.prev') }}
        </BaseSecondaryButton>
        <BaseSecondaryButton
          type="button"
          class="rounded-lg px-3 py-1 text-sm"
          :disabled="(store.offset ?? 0) + (store.limit ?? 50) >= store.total"
          @click="nextPage"
        >
          {{ t('admin.dnsHistory.next') }}
        </BaseSecondaryButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useDnsHistoryStore();

const searchQuery = ref('');
const selectedClient = ref('');
const selectedBlocked = ref('');
const selectedSort = ref('desc');

// Debounce timer for search
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const clientOptions = computed(() => {
  const allOption = { label: t('admin.dnsHistory.allClients'), value: '' };
  const clientOpts = (store.clients ?? []).map((c) => ({
    label: c,
    value: c,
  }));
  return [allOption, ...clientOpts];
});

const blockedOptions = computed(() => [
  { label: t('admin.dnsHistory.all'), value: '' },
  { label: t('admin.dnsHistory.blocked'), value: 'true' },
  { label: t('admin.dnsHistory.allowed'), value: 'false' },
]);

const sortOptions = computed(() => [
  { label: t('admin.dnsHistory.newest'), value: 'desc' },
  { label: t('admin.dnsHistory.oldest'), value: 'asc' },
]);

// Watch filters and fetch history
watch([selectedClient, selectedBlocked, selectedSort], () => {
  store.setOffset(0);
  fetchHistory();
});

// Debounce search input
watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    store.setOffset(0);
    fetchHistory();
  }, 300);
});

onMounted(() => {
  store.fetchClients();
  fetchHistory();
});

function fetchHistory() {
  const params: Record<string, unknown> = {
    limit: store.limit ?? 50,
    offset: store.offset ?? 0,
    sort: selectedSort.value,
  };
  if (searchQuery.value.trim()) {
    params.filter = searchQuery.value.trim();
  }
  if (selectedClient.value) {
    params.client = selectedClient.value;
  }
  if (selectedBlocked.value) {
    params.blocked = selectedBlocked.value === 'true';
  }
  store.fetchHistory(params);
}

function prevPage() {
  const newOffset = Math.max(0, (store.offset ?? 0) - (store.limit ?? 50));
  store.setOffset(newOffset);
  fetchHistory();
}

function nextPage() {
  const newOffset = (store.offset ?? 0) + (store.limit ?? 50);
  store.setOffset(newOffset);
  fetchHistory();
}

function formatTimestamp(ts?: string | number | null): string {
  if (!ts) return '-';
  const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  return date.toLocaleString();
}
</script>
