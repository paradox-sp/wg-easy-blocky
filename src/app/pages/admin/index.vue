<template>
  <main class="flex flex-col gap-6">
    <div
      class="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-gray-700 dark:border-red-950 dark:bg-red-950/30 dark:text-neutral-200"
    >
      {{ t('admin.overview.intro') }}
    </div>

    <section v-for="group in navigationGroups" :key="group.id">
      <h2
        class="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-neutral-400"
      >
        {{ group.name }}
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink
          v-for="item in group.items"
          :key="item.id"
          :to="item.to"
          class="group flex min-h-28 flex-col rounded-lg border border-gray-200 p-4 transition hover:border-red-700 hover:bg-red-50/50 focus:outline-none focus:ring-2 focus:ring-red-700 dark:border-neutral-600 dark:hover:border-red-700 dark:hover:bg-red-950/20"
        >
          <span
            class="font-semibold text-gray-800 group-hover:text-red-800 dark:text-neutral-100 dark:group-hover:text-red-300"
          >
            {{ item.name }}
          </span>
          <span class="mt-1 text-sm text-gray-500 dark:text-neutral-400">
            {{ item.description }}
          </span>
          <span
            aria-hidden="true"
            class="mt-auto pt-3 text-right text-red-700 transition group-hover:translate-x-1 dark:text-red-400"
          >
            &rarr;
          </span>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const { t } = useI18n();
const navigationGroups = useAdminNavigation();
</script>
