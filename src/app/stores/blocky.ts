import { defineStore } from 'pinia';

import type {
  BlockyConfigSchema,
  BlockyConfigUpdateType,
} from '#db/repositories/blockyConfig/types';

export interface BlockyStatus {
  enabled: boolean;
  autoEnableInSec?: number;
  disabledGroups?: string[];
}

export const useBlockyStore = defineStore('Blocky', () => {
  const config = ref<BlockyConfigSchema | null>(null);
  const status = ref<BlockyStatus | null>(null);
  const { loading, error, run } = useApiState();

  async function fetchConfig() {
    const data = await run(
      async () =>
        await $fetch<{ success: boolean; config: BlockyConfigSchema }>(
          '/api/admin/blocky/config'
        ),
      'Failed to fetch Blocky config'
    );
    if (data) config.value = data.config;
  }

  async function updateConfig(data: BlockyConfigUpdateType) {
    await run(
      async () => {
        await $fetch('/api/admin/blocky/config', {
          method: 'POST',
          body: data,
        });
        await fetchConfig();
        await fetchStatus();
      },
      'Failed to update Blocky config',
      true
    );
  }

  async function resetConfig() {
    await run(
      async () => {
        await $fetch('/api/admin/blocky/reset', {
          method: 'POST',
        });
        await fetchConfig();
        await fetchStatus();
      },
      'Failed to reset Blocky config',
      true
    );
  }

  async function fetchStatus() {
    const data = await run(
      async () =>
        await $fetch<{ success: boolean; status: BlockyStatus }>(
          '/api/admin/blocky/status'
        ),
      'Failed to fetch Blocky status'
    );
    status.value = data?.status ?? null;
  }

  return {
    config: readonly(config),
    status: readonly(status),
    loading: readonly(loading),
    error: readonly(error),
    fetchConfig,
    updateConfig,
    resetConfig,
    fetchStatus,
  };
});
