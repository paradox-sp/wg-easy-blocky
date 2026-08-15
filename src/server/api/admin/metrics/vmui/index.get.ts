import { getRequestURL, proxyRequest } from 'h3';
import VictoriaMetrics from '#server/utils/victoriaMetrics';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event }) => {
    const vmuiUrl = VictoriaMetrics.getVMUIUrl();
    const url = getRequestURL(event);
    const targetUrl = `${vmuiUrl}${url.pathname.replace('/api/admin/metrics/vmui', '')}${url.search}`;

    return proxyRequest(event, targetUrl, {
      headers: {
        'X-Forwarded-Host': event.node.req.headers.host || '',
      },
    });
  }
);
