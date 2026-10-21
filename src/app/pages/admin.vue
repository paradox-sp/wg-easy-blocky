<template>
  <div class="container mx-auto max-w-7xl px-3 py-4 sm:px-4">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
      <aside
        class="overflow-hidden rounded-lg border border-gray-100 bg-white text-gray-700 shadow-sm lg:sticky lg:top-4 lg:w-64 lg:shrink-0 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
      >
        <NuxtLink
          to="/admin"
          class="block border-b border-gray-100 px-5 py-4 transition hover:bg-gray-50 dark:border-neutral-600 dark:hover:bg-neutral-600"
          exact-active-class="bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          <span class="block text-xs font-semibold uppercase tracking-wider">
            {{ t('pages.admin.panel') }}
          </span>
          <span class="mt-1 block text-lg font-medium">
            {{ t('admin.overview.title') }}
          </span>
        </NuxtLink>

        <nav
          :aria-label="t('pages.admin.panel')"
          class="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-1"
        >
          <section v-for="group in navigationGroups" :key="group.id">
            <h2
              class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-400"
            >
              {{ group.name }}
            </h2>
            <div class="flex flex-col gap-1">
              <NuxtLink
                v-for="item in group.items"
                :key="item.id"
                :to="item.to"
                class="rounded-md px-3 py-2 text-sm font-medium transition hover:bg-gray-100 hover:text-red-800 dark:hover:bg-neutral-600 dark:hover:text-red-300"
                active-class="bg-red-800 text-white hover:bg-red-800 hover:text-white dark:bg-red-800 dark:text-white dark:hover:bg-red-800 dark:hover:text-white"
              >
                {{ item.name }}
              </NuxtLink>
            </div>
          </section>
        </nav>
      </aside>

      <section
        class="min-w-0 flex-1 overflow-hidden rounded-lg border border-gray-100 bg-white text-gray-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200"
      >
        <PanelHead>
          <div class="min-w-0 flex-1 py-1">
            <h1 class="text-xl font-semibold sm:text-2xl">
              {{ activeMenuItem.name }}
            </h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-neutral-400">
              {{ activeMenuItem.description }}
            </p>
          </div>
        </PanelHead>
        <PanelBody>
          <NuxtPage />
        </PanelBody>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const navigationGroups = useAdminNavigation();

const defaultItem = computed<AdminNavigationItem>(() => ({
  id: 'overview',
  to: '/admin',
  name: t('admin.overview.title'),
  description: t('admin.overview.description'),
}));

const activeMenuItem = computed(() => {
  for (const group of navigationGroups.value) {
    const item = group.items.find((candidate) => route.path === candidate.to);
    if (item) return item;
  }

  return defaultItem.value;
});
</script>
