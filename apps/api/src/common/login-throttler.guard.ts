import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLE_BUCKET_KEY } from './throttle-bucket.decorator.js';

// Routes that check a password against the same account (AuthController.login
// and OidcController.link) opt into a shared rate-limit bucket by applying
// @ThrottleBucket('shared-password-guess'). Without a shared bucket each
// route gets its own independent counter, letting an attacker make 5
// guesses/min against each — 10/min total against one account's password.
//
// The bucket name comes from Reflector metadata, not from a Set of hard-coded
// function references, so no import of the controller classes is needed here
// (eliminating the TDZ risk and making it easy to add future routes).
// Routes without @ThrottleBucket fall back to the default class+handler key.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const bucket = this.reflector.get<string | undefined>(THROTTLE_BUCKET_KEY, context.getHandler());
    const prefix = bucket ?? `${context.getClass().name}.${context.getHandler().name}`;
    return `${prefix}-${name}-${suffix}`;
  }
}
