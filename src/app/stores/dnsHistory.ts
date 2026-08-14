import { defineStore } from 'pinia';
import type {
  DnsHistoryResponse,
  DnsQueryPublic,
} from '#db/repositories/dnsQuery/types';

export interface DnsStats {
  totalQueries: number;
  blockedQueries: number;
  allowedQueries: number;
  uniqueClients: number;
  uniqueDomains: number;
}

export interface DnsHistoryParams {
  filter?: string;
  client?: string;
  domain?: string;
  blocked?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sort?: 'asc' | 'desc';
}

export const useDnsHistoryStore = defineStore('DnsHistory', () => {
  const queries = ref<DnsQueryPublic[]>([]);
  const total = ref(0);
  const limit = ref(100);
  const offset = ref(0);
  const clients = ref<string[]>([]);
  const stats = ref<DnsStats>({
    totalQueries: 0,
    blockedQueries: 0,
    allowedQueries: 0,
    uniqueClients: 0,
    uniqueDomains: 0,
  });
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchHistory(params: DnsHistoryParams = {}) {
    loading.value = true;
    error.value = null;
    try {
      const searchParams = new URLSearchParams();
      if (params.filter !== undefined && params.filter !== null) {
        searchParams.set('filter', params.filter);
      }
      if (params.client !== undefined && params.client !== null) {
        searchParams.set('client', params.client);
      }
      if (params.domain !== undefined && params.domain !== null) {
        searchParams.set('domain', params.domain);
      }
      if (params.blocked !== undefined && params.blocked !== null) {
        searchParams.set('blocked', String(params.blocked));
      }
      if (params.startDate !== undefined && params.startDate !== null) {
        searchParams.set('startDate', params.startDate);
      }
      if (params.endDate !== undefined && params.endDate !== null) {
        searchParams.set('endDate', params.endDate);
      }
      if (params.limit !== undefined && params.limit !== null) {
        searchParams.set('limit', String(params.limit));
      }
      if (params.offset !== undefined && params.offset !== null) {
        searchParams.set('offset', String(params.offset));
      }
      if (params.sort !== undefined && params.sort !== null) {
        searchParams.set('sort', params.sort);
      }

      const data = await $fetch<{ success: boolean } & DnsHistoryResponse>(
        '/api/admin/dns-history?' + searchParams.toString()
      );
      queries.value = data.queries;
      total.value = data.total;
      limit.value = data.limit;
      offset.value = data.offset;
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch DNS history';
    } finally {
      loading.value = false;
    }
  }

  async function fetchClients() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ success: boolean; clients: string[] }>(
        '/api/admin/dns-history/clients'
      );
      clients.value = data.clients;
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch DNS clients';
    } finally {
      loading.value = false;
    }
  }

  async function fetchStats() {
    loading.value = true;
    error.value = null;
    try {
      const data = await $fetch<{ success: boolean; stats: DnsStats }>(
        '/api/admin/dns-history/stats'
      );
      stats.value = data.stats;
    } catch (err) {
      error.value =
        (err as { data?: { message?: string } } | null)?.data?.message ||
        'Failed to fetch DNS stats';
    } finally {
      loading.value = false;
    }
  }

  function setOffset(n: number) {
    offset.value = Math.max(0, n);
  }

  function setLimit(n: number) {
    limit.value = n;
  }

  return {
    queries: readonly(queries),
    total: readonly(total),
    limit: readonly(limit),
    offset: readonly(offset),
    clients: readonly(clients),
    stats: readonly(stats),
    loading: readonly(loading),
    error: readonly(error),
    fetchHistory,
    fetchClients,
    fetchStats,
    setOffset,
    setLimit,
  };
});
