import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { of } from 'rxjs';
import { REQUEST_ID_HEADER, RequestIdInterceptor } from './request-id.interceptor.js';

describe('RequestIdInterceptor', () => {
  let interceptor: RequestIdInterceptor;
  let mockRes: { setHeader: ReturnType<typeof vi.fn> };
  let handler: CallHandler;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
    mockRes = { setHeader: vi.fn() };
    handler = { handle: () => of(null) };
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function makeContext(headers: Record<string, string> = {}): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, method: 'GET', path: '/test' }),
        getResponse: () => mockRes,
      }),
    } as unknown as ExecutionContext;
  }

  it('echoes an incoming X-Request-ID header on the response', async () => {
    const ctx = makeContext({ [REQUEST_ID_HEADER]: 'existing-id' });
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
    });
    expect(mockRes.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'existing-id');
  });

  it('generates a UUID when no X-Request-ID header is present', async () => {
    const ctx = makeContext();
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
    });
    const [header, value] = mockRes.setHeader.mock.calls[0] as [string, string];
    expect(header).toBe(REQUEST_ID_HEADER);
    expect(value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('logs the request method, path, and request ID', async () => {
    const ctx = makeContext({ [REQUEST_ID_HEADER]: 'trace-123' });
    await new Promise<void>((resolve) => {
      interceptor.intercept(ctx, handler).subscribe({ complete: resolve });
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('trace-123'));
  });
});
