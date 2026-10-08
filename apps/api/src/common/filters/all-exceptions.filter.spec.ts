import { ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';
import type { Mock } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost(): { host: ArgumentsHost; status: Mock; json: Mock } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/posts' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  // A bound reference, called as a plain function below: oxlint's
  // promise(valid-params) rule pattern-matches any `.catch(a, b)` call
  // syntactically and misreads ExceptionFilter's required method name as
  // Promise.prototype.catch. Binding first keeps the call site as
  // `handle(exception, host)`, with no literal `.catch(` for the rule to
  // match, instead of suppressing a real lint rule with a disable comment.
  let handle: AllExceptionsFilter['catch'];
  let errorSpy: Mock;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    handle = filter.catch.bind(filter);
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined) as Mock;
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('passes an HttpException through with its own status and body, unlogged', () => {
    const { host, status, json } = mockHost();
    const exception = new BadRequestException(['email must be an email']);

    handle(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(exception.getResponse());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // body-parser's PayloadTooLargeError (via the "http-errors" package) is
  // thrown before Nest's router sees the request, so it is never an
  // HttpException — but it must still 413, not fall through to the masked
  // 500 below. Shape matches what raw-body's createError(413, ...) actually
  // produces (status/statusCode/expose), not a guess.
  it('passes through an http-errors-shaped error with its own status, unmasked', () => {
    const { host, status, json } = mockHost();
    const exception = Object.assign(new Error('request entity too large'), {
      expose: true,
      statusCode: 413,
      status: 413,
      type: 'entity.too.large',
    });

    handle(exception, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ statusCode: 413, message: 'request entity too large' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // ThrottlerException (and other HttpExceptions built from a plain string
  // rather than an object) is the real-world case this guards: it caught a
  // regression where the string came back as the entire response body
  // instead of { statusCode, message }, breaking every 429 assertion.
  it('wraps an HttpException whose response is a plain string, like ThrottlerException', () => {
    const { host, status, json } = mockHost();
    const exception = new HttpException('ThrottlerException: Too Many Requests', 429);

    handle(exception, host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'ThrottlerException: Too Many Requests',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('masks a raw Error as a generic 500 and logs the stack', () => {
    const { host, status, json } = mockHost();
    const exception = new Error('connection terminated unexpectedly');

    handle(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
    expect(JSON.stringify(json.mock.calls[0])).not.toMatch(/connection terminated/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[1]).toBe(exception.stack);
  });
});
