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
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchConfig() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{
        success: boolean;
        config: BlockyConfigSchema;
      }>('/api/admin/blocky/config');
      config.value = data.config;
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch Blocky config';
    } finally {
      loading.value = false;
    }
  }

  async function updateConfig(data: BlockyConfigUpdateType) {
    loading.value = true;
    error.value = null;
    try {
      await $fetch('/api/admin/blocky/config', {
        method: 'POST',
        body: data,
      });
      await fetchConfig();
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to update Blocky config';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function resetConfig() {
    loading.value = true;
    error.value = null;
    try {
      await $fetch('/api/admin/blocky/reset', {
        method: 'POST',
      });
      await fetchConfig();
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to reset Blocky config';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchStatus() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{
        success: boolean;
        status: BlockyStatus;
      }>('/api/admin/blocky/status');
      status.value = data.status;
    } catch (err) {
      status.value = null;
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch Blocky status';
    } finally {
      loading.value = false;
    }
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
