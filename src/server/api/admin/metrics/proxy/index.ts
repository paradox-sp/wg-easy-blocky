import { VICTORIA_METRICS_ENV } from '#server/utils/config';
import { defineMetricsProxyHandler } from '#server/utils/metricsProxy';

export default defineMetricsProxyHandler({
  prefix: '/api/admin/metrics/proxy',
  baseUrl: VICTORIA_METRICS_ENV.URL,
});
