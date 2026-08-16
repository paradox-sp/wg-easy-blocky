<template>
  <div class="col-span-full flex flex-col gap-2">
    <div
      v-for="(item, i) in items"
      :key="i"
      class="flex flex-row items-center gap-1"
    >
      <BaseInput
        :model-value="item"
        class="flex-1"
        type="text"
        @update:model-value="setItem(i, $event)"
      />
      <BaseSecondaryButton
        type="button"
        class="shrink-0 rounded-lg px-2 py-2"
        @click="emit('remove', i)"
      >
        <IconsDelete class="size-4" />
      </BaseSecondaryButton>
    </div>
    <div class="mt-1">
      <BasePrimaryButton type="button" class="rounded-lg" @click="emit('add')">
        <IconsPlus class="mr-1 size-4" />
        {{ addLabel }}
      </BasePrimaryButton>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  items: string[];
  addLabel: string;
}>();

const emit = defineEmits<{
  add: [];
  remove: [index: number];
  update: [item: { index: number; value: string }];
}>();

function setItem(index: number, value: unknown) {
  emit('update', { index, value: String(value ?? '') });
}
</script>
