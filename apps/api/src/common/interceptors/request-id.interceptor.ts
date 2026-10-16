import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestIdInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const requestId =
      (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    this.logger.log(`[${requestId}] ${req.method} ${req.path}`);

    return next.handle();
  }
}
