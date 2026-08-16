import { getRequestURL, proxyRequest } from 'h3';
import type { H3Event } from 'h3';

import { definePermissionEventHandler } from '#server/utils/handler';

type MetricsProxyOptions = {
  /**
   * Route prefix to strip from the incoming path, e.g.
   * '/api/admin/metrics/proxy'.
   */
  prefix: string;
  /** Base URL of the upstream service the request is proxied to. */
  baseUrl: string | ((event: H3Event) => string);
  /** Extra headers to forward to the upstream service. */
  headers?: (event: H3Event) => Record<string, string>;
};

/**
 * Builds an admin-only reverse proxy handler for a metrics service
 * (VictoriaMetrics HTTP API or the VMUI web UI). The incoming path is
 * rewritten to the upstream service by stripping `prefix`.
 *
 * Both the `index` and catch-all `[...]` routes must be wired up to this
 * handler so the root path is proxied too.
 */
export function defineMetricsProxyHandler({
  prefix,
  baseUrl,
  headers,
}: MetricsProxyOptions) {
  return definePermissionEventHandler('admin', 'any', async ({ event }) => {
    const url = getRequestURL(event);
    const resolvedBaseUrl =
      typeof baseUrl === 'function' ? baseUrl(event) : baseUrl;
    const targetUrl = `${resolvedBaseUrl}${url.pathname.replace(prefix, '')}${url.search}`;

    return proxyRequest(
      event,
      targetUrl,
      headers ? { headers: headers(event) } : undefined
    );
  });
}
