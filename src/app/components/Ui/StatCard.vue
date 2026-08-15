<template>
  <div
    class="flex h-full flex-col gap-1 rounded-lg border-2 border-gray-100 bg-white p-4 shadow-sm transition dark:border-neutral-600 dark:bg-neutral-700"
  >
    <div class="flex items-center justify-between">
      <span
        class="text-sm font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-400"
      >
        {{ title }}
      </span>
      <slot name="icon" />
    </div>
    <div
      :class="[
        'mt-auto text-2xl font-semibold',
        color === 'red'
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-800 dark:text-neutral-100',
      ]"
    >
      {{ value }}
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    value: string | number;
    color?: 'red' | 'default';
  }>(),
  {
    color: 'default',
  }
);
</script>
