import { setTimeout as delay } from 'node:timers/promises';

import {
  getRequestURL,
  proxyRequest,
  send,
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
} from 'h3';
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
  /**
   * Allow the private upstream UI to be embedded by the authenticated
   * same-origin admin page. API proxies must leave this disabled.
   */
  allowEmbedding?: boolean;
};

const EMBEDDING_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
} as const;
const UPSTREAM_RETRY_DELAYS_MS = [100, 250] as const;
const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>VictoriaMetrics unavailable</title>
  </head>
  <body>
    <p>VictoriaMetrics is unavailable. Check the container logs, then reload this page.</p>
  </body>
</html>`;

async function fetchWithStartupRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      const retryDelay = UPSTREAM_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined || init?.signal?.aborted) {
        throw error;
      }
      await delay(retryDelay, undefined, {
        signal: init?.signal ?? undefined,
      });
    }
  }
}

function allowSameOriginEmbedding(event: H3Event) {
  setResponseHeaders(event, EMBEDDING_HEADERS);
}

function rewriteUpstreamLocation(
  event: H3Event,
  response: Response,
  upstreamBaseUrl: string,
  targetUrl: string,
  prefix: string
) {
  const location = response.headers.get('location');
  if (!location) return;

  const upstreamBase = new URL(upstreamBaseUrl);
  const resolvedLocation = new URL(location, targetUrl);
  const upstreamPath = upstreamBase.pathname.replace(/\/$/, '');
  if (
    resolvedLocation.origin !== upstreamBase.origin ||
    (resolvedLocation.pathname !== upstreamPath &&
      !resolvedLocation.pathname.startsWith(`${upstreamPath}/`))
  ) {
    return;
  }

  const suffix = resolvedLocation.pathname.slice(upstreamPath.length);
  setResponseHeader(
    event,
    'Location',
    `${prefix}${suffix}${resolvedLocation.search}${resolvedLocation.hash}`
  );
}

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
  allowEmbedding = false,
}: MetricsProxyOptions) {
  return definePermissionEventHandler('admin', 'any', async ({ event }) => {
    const url = getRequestURL(event);
    const resolvedBaseUrl =
      typeof baseUrl === 'function' ? baseUrl(event) : baseUrl;
    const targetUrl = `${resolvedBaseUrl}${url.pathname.replace(prefix, '')}${url.search}`;

    try {
      return await proxyRequest(event, targetUrl, {
        ...(headers ? { headers: headers(event) } : {}),
        ...(allowEmbedding
          ? {
              fetch: fetchWithStartupRetry,
              fetchOptions: { redirect: 'manual' as const },
            }
          : {}),
        onResponse: allowEmbedding
          ? (proxyEvent, response) => {
              allowSameOriginEmbedding(proxyEvent);
              rewriteUpstreamLocation(
                proxyEvent,
                response,
                resolvedBaseUrl,
                targetUrl,
                prefix
              );
            }
          : undefined,
      });
    } catch (error) {
      if (!allowEmbedding) throw error;

      console.error(`VMUI proxy request to ${targetUrl} failed:`, error);
      setResponseStatus(event, 502, 'Bad Gateway');
      setResponseHeaders(event, {
        ...EMBEDDING_HEADERS,
        'Cache-Control': 'no-store',
      });
      return send(event, UNAVAILABLE_PAGE, 'text/html; charset=utf-8');
    }
  });
}
