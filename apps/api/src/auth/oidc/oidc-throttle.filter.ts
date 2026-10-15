import type { ArgumentsHost } from '@nestjs/common';
import { Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { getWebAppOrigin } from './oidc.constants.js';

// /start and /callback are browser navigations, not XHR calls — returning a
// JSON 429 mid-redirect is jarring and confusing to the user. This filter
// catches rate-limit exceptions on those two routes and turns them into a
// redirect to /login with a recognisable error param instead.
// /link is intentionally excluded: it is an XHR call from /vincular-conta
// and the normal JSON 429 (with Retry-After) is the right response there.
@Catch(ThrottlerException)
export class OidcThrottleExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.redirect(`${getWebAppOrigin()}/login?error=too_many_requests`);
  }
}
