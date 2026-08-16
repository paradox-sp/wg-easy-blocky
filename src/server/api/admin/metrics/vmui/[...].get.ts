import VictoriaMetrics from '#server/utils/victoriaMetrics';
import { defineMetricsProxyHandler } from '#server/utils/metricsProxy';

export default defineMetricsProxyHandler({
  prefix: '/api/admin/metrics/vmui',
  baseUrl: VictoriaMetrics.getVMUIUrl,
  headers: (event) => ({
    'X-Forwarded-Host': event.node.req.headers.host || '',
  }),
});
