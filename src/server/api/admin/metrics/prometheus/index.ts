import { getRequestURL, proxyRequest } from 'h3';

import { VICTORIA_METRICS_ENV } from '#server/utils/config';
import { definePermissionEventHandler } from '#server/utils/handler';

export default definePermissionEventHandler(
  'admin',
  'any',
  async ({ event }) => {
    const vmUrl = VICTORIA_METRICS_ENV.URL;
    const url = getRequestURL(event);
    const targetUrl = `${vmUrl}/prometheus${url.pathname.replace('/api/admin/metrics/prometheus', '')}${url.search}`;

    return proxyRequest(event, targetUrl);
  }
);
