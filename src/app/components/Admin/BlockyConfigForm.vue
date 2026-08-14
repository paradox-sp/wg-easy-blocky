<template>
  <main v-if="store.config">
    <FormElement @submit.prevent="save">
      <FormGroup>
        <FormHeading>{{ t('admin.blocky.upstream') }}</FormHeading>
        <div class="col-span-full flex flex-col gap-2">
          <div
            v-for="(item, i) in form.upstream"
            :key="i"
            class="flex flex-row items-center gap-1"
          >
            <BaseInput
              v-model="form.upstream[i]"
              class="flex-1"
              type="text"
            />
            <BaseSecondaryButton
              type="button"
              class="shrink-0 rounded-lg px-2 py-2"
              @click="removeItem('upstream', i)"
            >
              <IconsDelete class="size-4" />
            </BaseSecondaryButton>
          </div>
          <div class="mt-1">
            <BasePrimaryButton
              type="button"
              class="rounded-lg"
              @click="addItem('upstream')"
            >
              <IconsPlus class="mr-1 size-4" />
              {{ t('admin.blocky.addUpstream') }}
            </BasePrimaryButton>
          </div>
        </div>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ t('admin.blocky.bootstrapDns') }}</FormHeading>
        <div class="col-span-full flex flex-col gap-2">
          <div
            v-for="(item, i) in form.bootstrapDns"
            :key="i"
            class="flex flex-row items-center gap-1"
          >
            <BaseInput
              v-model="form.bootstrapDns[i]"
              class="flex-1"
              type="text"
            />
            <BaseSecondaryButton
              type="button"
              class="shrink-0 rounded-lg px-2 py-2"
              @click="removeItem('bootstrapDns', i)"
            >
              <IconsDelete class="size-4" />
            </BaseSecondaryButton>
          </div>
          <div class="mt-1">
            <BasePrimaryButton
              type="button"
              class="rounded-lg"
              @click="addItem('bootstrapDns')"
            >
              <IconsPlus class="mr-1 size-4" />
              {{ t('admin.blocky.addBootstrapDns') }}
            </BasePrimaryButton>
          </div>
        </div>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ t('admin.blocky.blockingMode') }}</FormHeading>
        <div class="col-span-full">
          <BaseSelect
            v-model="form.blocking.blockType"
            :options="blockingModeOptions"
          />
        </div>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ t('admin.blocky.blockLists') }}</FormHeading>
        <div class="col-span-full flex flex-col gap-2">
          <div
            v-for="(item, i) in form.blocking.blockLists"
            :key="i"
            class="flex flex-row items-center gap-1"
          >
            <BaseInput
              v-model="form.blocking.blockLists[i]"
              class="flex-1"
              type="text"
            />
            <BaseSecondaryButton
              type="button"
              class="shrink-0 rounded-lg px-2 py-2"
              @click="removeItem('blocking.blockLists', i)"
            >
              <IconsDelete class="size-4" />
            </BaseSecondaryButton>
          </div>
          <div class="mt-1">
            <BasePrimaryButton
              type="button"
              class="rounded-lg"
              @click="addItem('blocking.blockLists')"
            >
              <IconsPlus class="mr-1 size-4" />
              {{ t('admin.blocky.addBlockList') }}
            </BasePrimaryButton>
          </div>
        </div>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ t('admin.blocky.allowLists') }}</FormHeading>
        <div class="col-span-full flex flex-col gap-2">
          <div
            v-for="(item, i) in form.blocking.allowLists"
            :key="i"
            class="flex flex-row items-center gap-1"
          >
            <BaseInput
              v-model="form.blocking.allowLists[i]"
              class="flex-1"
              type="text"
            />
            <BaseSecondaryButton
              type="button"
              class="shrink-0 rounded-lg px-2 py-2"
              @click="removeItem('blocking.allowLists', i)"
            >
              <IconsDelete class="size-4" />
            </BaseSecondaryButton>
          </div>
          <div class="mt-1">
            <BasePrimaryButton
              type="button"
              class="rounded-lg"
              @click="addItem('blocking.allowLists')"
            >
              <IconsPlus class="mr-1 size-4" />
              {{ t('admin.blocky.addAllowList') }}
            </BasePrimaryButton>
          </div>
        </div>
      </FormGroup>
      <FormGroup>
        <FormHeading>{{ t('form.actions') }}</FormHeading>
        <div class="col-span-full flex flex-wrap gap-2">
          <input
            :value="saving ? t('admin.blocky.saving') : t('admin.blocky.save')"
            type="submit"
            :disabled="saving"
            class="rounded-lg border-2 border-red-800 bg-red-800 px-4 py-2 text-white hover:border-red-600 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <BaseDialog :trigger-class="'rounded-lg'">
            <template #trigger>
              <BaseSecondaryButton type="button" class="rounded-lg">
                {{ t('admin.blocky.resetToDefaults') }}
              </BaseSecondaryButton>
            </template>
            <template #title>
              {{ t('admin.blocky.resetToDefaults') }}
            </template>
            <template #description>
              {{ t('admin.blocky.resetConfirm') }}
            </template>
            <template #actions>
              <DialogClose as-child>
                <BaseSecondaryButton type="button" class="rounded-lg">
                  {{ t('dialog.cancel') }}
                </BaseSecondaryButton>
              </DialogClose>
              <DialogClose as-child>
                <BasePrimaryButton
                  type="button"
                  class="rounded-lg"
                  @click="confirmReset"
                >
                  {{ t('dialog.change') }}
                </BasePrimaryButton>
              </DialogClose>
            </template>
          </BaseDialog>
        </div>
      </FormGroup>
    </FormElement>
    <div
      v-if="store.error"
      class="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400"
    >
      {{ store.error }}
    </div>
  </main>
</template>

<script setup lang="ts">
const { t } = useI18n();
const store = useBlockyStore();

const saving = ref(false);

const form = reactive({
  upstream: [] as string[],
  bootstrapDns: [] as string[],
  blocking: {
    blockType: 'zeroIp' as 'zeroIp' | 'nxdomain',
    blockLists: [] as string[],
    allowLists: [] as string[],
  },
});

const blockingModeOptions = computed(() => [
  { label: 'Zero IP', value: 'zeroIp' },
  { label: 'NXDOMAIN', value: 'nxdomain' },
]);

function populateForm() {
  if (!store.config) return;
  form.upstream = [...(store.config.upstream ?? [])];
  form.bootstrapDns = [...(store.config.bootstrapDns ?? [])];
  form.blocking.blockType = store.config.blocking?.blockType ?? 'zeroIp';
  form.blocking.blockLists = [...(store.config.blocking?.blockLists ?? [])];
  form.blocking.allowLists = [...(store.config.blocking?.allowLists ?? [])];
}

// Load config on mount and populate form
onMounted(async () => {
  await store.fetchConfig();
  populateForm();
});

type ArrayField = 'upstream' | 'bootstrapDns' | 'blocking.blockLists' | 'blocking.allowLists';

function getArray(field: ArrayField): string[] {
  if (field === 'upstream') return form.upstream;
  if (field === 'bootstrapDns') return form.bootstrapDns;
  if (field === 'blocking.blockLists') return form.blocking.blockLists;
  return form.blocking.allowLists;
}

function addItem(field: ArrayField) {
  getArray(field).push('');
}

function removeItem(field: ArrayField, index: number) {
  getArray(field).splice(index, 1);
}

function filterEmpty(arr: string[]): string[] {
  return arr.filter((s) => s.trim() !== '');
}

async function save() {
  saving.value = true;
  try {
    const payload = {
      upstream: filterEmpty(form.upstream),
      bootstrapDns: filterEmpty(form.bootstrapDns),
      blocking: {
        blockType: form.blocking.blockType,
        blockLists: filterEmpty(form.blocking.blockLists),
        allowLists: filterEmpty(form.blocking.allowLists),
        clientGroupsBlock: store.config?.blocking?.clientGroupsBlock ?? {},
      },
    };

    await store.updateConfig(payload);
  } finally {
    saving.value = false;
  }
}

async function confirmReset() {
  await store.resetConfig();
  // Reload form from new config
  await store.fetchConfig();
  populateForm();
}
</script>
