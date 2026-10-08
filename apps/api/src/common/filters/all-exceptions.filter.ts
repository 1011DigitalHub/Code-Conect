import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';

// Express middleware (body-parser's PayloadTooLargeError, for one) throws
// errors shaped like the "http-errors" package — expose/statusCode/status —
// rather than a Nest HttpException, because it runs before Nest's router
// even sees the request. Copied from the signature Nest's own
// BaseExceptionFilter checks for, so a 10kb-over request still 413s instead
// of falling into the generic masked 500 below.
//
// expose === true specifically, not just typeof 'boolean': the http-errors
// package sets it to (status < 500), which is exactly "safe for a client to
// see". An error in this shape with expose: false is a 5xx the library
// itself says not to return as-is — treating it as pass-through would leak
// that message unmasked and skip the log that's the only server-side
// record of it.
function isHttpError(err: unknown): err is { statusCode: number; message: string } {
  return (
    err instanceof Error &&
    'expose' in err &&
    err.expose === true &&
    'statusCode' in err &&
    typeof err.statusCode === 'number' &&
    'status' in err &&
    err.status === err.statusCode
  );
}

type ErrorBody = { statusCode: number; message: unknown; error?: string };

// Catches everything APP_GUARD/the ValidationPipe/a service didn't already
// turn into an HttpException, so a bug that throws a raw Error still comes
// back as the documented error shape instead of an Express default page
// (or, worse, a Prisma message with table and column names in it).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.resolve(exception, host);

    // A response whose headers already went out (a handler that started
    // streaming before throwing, for instance) can't be reshaped — calling
    // response.status() here throws ERR_HTTP_HEADERS_SENT, the same case
    // Nest's own BaseExceptionFilter guards against. resolve() already ran
    // (and already logged, for the unknown-error branch), so nothing is
    // lost by just letting the connection end instead of fighting it.
    if (response.headersSent) {
      response.end();
      return;
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown, host: ArgumentsHost): { status: number; body: ErrorBody } {
    // Mirrors Nest's own BaseExceptionFilter: most built-in exceptions
    // (BadRequestException, ...) already carry an object body, but one
    // constructed with a plain string — ThrottlerException does exactly
    // this — has getResponse() return that raw string, not an object.
    // Nest's default filter wraps it in { statusCode, message } for the
    // same reason; skipping this step passed the string straight through as
    // the whole body and broke every 429 assertion in throttle.e2e-spec.ts.
    // The error field it leaves out, this adds back from the status code
    // itself, to actually match the ErrorResponseDto shape this filter
    // claims to guarantee.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const body: ErrorBody =
        typeof res === 'object' && res !== null
          ? (res as ErrorBody)
          : { statusCode: status, message: res, error: STATUS_CODES[status] };
      return { status, body };
    }

    // A client sending too much data is normal operation, same as a wrong
    // password — expose: true on an http-errors-shaped error means the
    // library itself considers the message safe to return as-is.
    if (isHttpError(exception)) {
      return {
        status: exception.statusCode,
        body: {
          statusCode: exception.statusCode,
          message: exception.message,
          error: STATUS_CODES[exception.statusCode],
        },
      };
    }

    // Anything else is a bug, not a client mistake — a 401 or 404 is normal
    // operation and would just turn the log into noise no one reads.
    const request = host.switchToHttp().getRequest<Request>();
    const error = exception instanceof Error ? exception : new Error(String(exception));
    // request.path, not request.url: url keeps the query string, and
    // nothing stops a future route from receiving a token or email there —
    // this log line would otherwise capture it on every single 500.
    this.logger.error(`${request.method} ${request.path}`, error.stack);

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
      },
    };
  }
}
