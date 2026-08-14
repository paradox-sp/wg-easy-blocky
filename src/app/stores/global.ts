export const useGlobalStore = defineStore('Global', () => {
  const { data: information, refresh: refreshInformation } = useFetch(
    '/api/information',
    {
      method: 'get',
    }
  );

  const blockyEnabled = computed(
    () => information.value?.blockyEnabled ?? false
  );

  const victoriaMetricsEnabled = computed(
    () => information.value?.victoriaMetricsEnabled ?? false
  );

  const sortClient = ref<'asc' | 'desc'>('asc');

  const uiShowCharts = useCookie<boolean>('uiShowCharts', {
    default: () => false,
    maxAge: 365 * 24 * 60 * 60,
  });

  function toggleCharts() {
    uiShowCharts.value = !uiShowCharts.value;
  }

  const uiChartType = useCookie<'area' | 'bar' | 'line'>('uiChartType', {
    default: () => 'area',
    maxAge: 365 * 24 * 60 * 60,
  });

  return {
    blockyEnabled,
    victoriaMetricsEnabled,
    sortClient,
    information,
    refreshInformation,
    uiShowCharts,
    toggleCharts,
    uiChartType,
  };
});
