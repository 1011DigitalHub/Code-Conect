import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

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
// that message unmasked and, since this branch returns before the logger
// call below, unlogged too.
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

// Catches everything APP_GUARD/the ValidationPipe/a service didn't already
// turn into an HttpException, so a bug that throws a raw Error still comes
// back as the documented error shape instead of an Express default page
// (or, worse, a Prisma message with table and column names in it).
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Mirrors Nest's own BaseExceptionFilter: most built-in exceptions
    // (BadRequestException, ...) already carry an object body, but one
    // constructed with a plain string — ThrottlerException does exactly
    // this — has getResponse() return that raw string, not an object. Nest's
    // default filter wraps it in { statusCode, message } for the same
    // reason; skipping this step here passed the string straight through as
    // the whole body and broke every 429 assertion in throttle.e2e-spec.ts.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      response
        .status(status)
        .json(typeof body === 'object' && body !== null ? body : { statusCode: status, message: body });
      return;
    }

    // A client sending too much data is normal operation, same as a wrong
    // password — expose: true on an http-errors-shaped error means the
    // library itself considers the message safe to return as-is.
    if (isHttpError(exception)) {
      response
        .status(exception.statusCode)
        .json({ statusCode: exception.statusCode, message: exception.message });
      return;
    }

    // Anything else is a bug, not a client mistake — a 401 or 404 is normal
    // operation and would just turn the log into noise no one reads.
    const request = ctx.getRequest<Request>();
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${request.method} ${request.url}`, error.stack);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
    });
  }
}
