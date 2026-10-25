import type { H3Event } from 'h3';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { defineMetricsProxyHandler } from '#server/utils/metricsProxy';

const h3Mocks = vi.hoisted(() => ({
  createError: vi.fn((input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input)
  ),
  getHeader: vi.fn(),
  getRequestURL: vi.fn(),
  proxyRequest: vi.fn(),
  send: vi.fn(),
  setResponseHeader: vi.fn(),
  setResponseHeaders: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock('h3', () => h3Mocks);

vi.mock('#server/utils/handler', () => ({
  definePermissionEventHandler: vi.fn(
    (
      _resource: string,
      _action: string,
      handler: (params: { event: H3Event }) => unknown
    ) =>
      (event: H3Event) =>
        handler({ event })
  ),
}));

function createEvent(headers: Record<string, string> = {}): H3Event {
  return {
    node: {
      req: {
        headers: { host: 'vpn.example.test', ...headers },
      },
      res: {},
    },
  } as unknown as H3Event;
}

function createHandler(allowEmbedding = true, embeddedParentPath?: string) {
  return defineMetricsProxyHandler({
    prefix: '/api/admin/metrics/vmui',
    baseUrl: 'http://127.0.0.1:8428/vmui',
    headers: (event) => ({
      'X-Forwarded-Host': event.node.req.headers.host || '',
    }),
    allowEmbedding,
    embeddedParentPath,
  });
}

beforeEach(() => {
  h3Mocks.createError.mockClear();
  h3Mocks.getHeader
    .mockReset()
    .mockImplementation(
      (event: H3Event, name: string) =>
        event.node.req.headers[name.toLowerCase()] as string | undefined
    );
  h3Mocks.getRequestURL.mockReset();
  h3Mocks.proxyRequest.mockReset();
  h3Mocks.send.mockReset().mockResolvedValue(undefined);
  h3Mocks.setResponseHeader.mockReset();
  h3Mocks.setResponseHeaders.mockReset();
  h3Mocks.setResponseStatus.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('metrics proxy', () => {
  test('proxies VMUI assets and query strings to the private upstream', async () => {
    const event = createEvent();
    h3Mocks.getRequestURL.mockReturnValue(
      new URL(
        'https://vpn.example.test/api/admin/metrics/vmui/static/app.js?v=1'
      )
    );
    h3Mocks.proxyRequest.mockResolvedValue(undefined);

    await createHandler()(event);

    expect(h3Mocks.proxyRequest).toHaveBeenCalledWith(
      event,
      'http://127.0.0.1:8428/vmui/static/app.js?v=1',
      expect.objectContaining({
        headers: { 'X-Forwarded-Host': 'vpn.example.test' },
        fetch: expect.any(Function),
        fetchOptions: { redirect: 'manual' },
        onResponse: expect.any(Function),
      })
    );
  });

  test('serves the VMUI document only inside the admin metrics iframe', async () => {
    const event = createEvent({
      referer: 'https://vpn.example.test/admin/metrics',
      'sec-fetch-dest': 'iframe',
    });
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/')
    );
    h3Mocks.proxyRequest.mockResolvedValue(undefined);

    await createHandler(true, '/admin/metrics')(event);

    expect(h3Mocks.proxyRequest).toHaveBeenCalledOnce();
  });

  test('allows the admin iframe when insecure HTTP omits fetch metadata', async () => {
    const event = createEvent({
      referer: 'http://vpn.example.test/admin/metrics',
    });
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('http://vpn.example.test/api/admin/metrics/vmui/')
    );
    h3Mocks.proxyRequest.mockResolvedValue(undefined);

    await createHandler(true, '/admin/metrics')(event);

    expect(h3Mocks.proxyRequest).toHaveBeenCalledOnce();
  });

  test('rejects direct VMUI document navigation', async () => {
    const event = createEvent({
      'sec-fetch-dest': 'document',
    });
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/')
    );

    await expect(
      createHandler(true, '/admin/metrics')(event)
    ).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'VMUI is only available in the admin metrics page',
    });
    expect(h3Mocks.proxyRequest).not.toHaveBeenCalled();
  });

  test('keeps successful VMUI responses embeddable only by the same origin', async () => {
    const event = createEvent();
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/')
    );
    h3Mocks.proxyRequest.mockImplementation(
      async (
        _event: H3Event,
        _target: string,
        options: {
          onResponse?: (event: H3Event, response: Response) => void;
        }
      ) => {
        options.onResponse?.(event, new Response());
      }
    );

    await createHandler()(event);

    expect(h3Mocks.setResponseHeaders).toHaveBeenCalledWith(event, {
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
    });
  });

  test('rewrites private upstream redirects back through the admin proxy', async () => {
    const event = createEvent();
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui')
    );
    h3Mocks.proxyRequest.mockImplementation(
      async (
        _event: H3Event,
        _target: string,
        options: {
          onResponse?: (event: H3Event, response: Response) => void;
        }
      ) => {
        options.onResponse?.(
          event,
          new Response(null, {
            status: 302,
            headers: { Location: 'vmui/?' },
          })
        );
      }
    );

    await createHandler()(event);

    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'Location',
      '/api/admin/metrics/vmui/'
    );
  });
  test('retries temporary VMUI connection failures', async () => {
    vi.useFakeTimers();
    const event = createEvent();
    const response = new Response('<html></html>', { status: 200 });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('connection refused'))
      .mockRejectedValueOnce(new TypeError('connection refused'))
      .mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/')
    );
    h3Mocks.proxyRequest.mockImplementation(
      async (
        _event: H3Event,
        target: string,
        options: { fetch: typeof fetch }
      ) => options.fetch(target)
    );

    const request = createHandler()(event);
    await vi.advanceTimersByTimeAsync(350);

    await expect(request).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('returns a frame-compatible diagnostic page when VMUI is unavailable', async () => {
    const event = createEvent();
    const error = new Error('upstream unavailable');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/')
    );
    h3Mocks.proxyRequest.mockRejectedValue(error);

    await createHandler()(event);

    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(
      event,
      502,
      'Bad Gateway'
    );
    expect(h3Mocks.setResponseHeaders).toHaveBeenCalledWith(event, {
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    });
    expect(h3Mocks.send).toHaveBeenCalledWith(
      event,
      expect.stringContaining('VictoriaMetrics is unavailable'),
      'text/html; charset=utf-8'
    );
    expect(console.error).toHaveBeenCalledWith(
      'VMUI proxy request to http://127.0.0.1:8428/vmui/ failed:',
      error
    );
  });

  test('preserves standard error handling for non-embedded API proxies', async () => {
    const event = createEvent();
    const error = new Error('upstream unavailable');
    h3Mocks.getRequestURL.mockReturnValue(
      new URL('https://vpn.example.test/api/admin/metrics/vmui/api/v1/query')
    );
    h3Mocks.proxyRequest.mockRejectedValue(error);

    await expect(createHandler(false)(event)).rejects.toBe(error);
    expect(h3Mocks.send).not.toHaveBeenCalled();
    expect(h3Mocks.setResponseHeaders).not.toHaveBeenCalled();
  });
});
