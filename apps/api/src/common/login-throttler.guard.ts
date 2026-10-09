import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// AuthController.login and OidcController.link both end up checking a
// password against the same local account (OidcService.linkAccount calls
// the same verifyUserPassword as AuthService.signIn) — left alone, each
// @Throttle({ default: LOGIN_THROTTLE }) handler gets its OWN bucket
// (ThrottlerGuard's default generateKey keys by class+handler+tracker), so
// an attacker gets 5 guesses/min against each independently: 10/min total
// against one account's password, not 5. Obtaining a linking_token to use
// against /link costs the attacker nothing — it's minted for any email on
// the password-collision branch regardless of email_verified (see
// OidcService.resolveIdentity's own comment on why that branch doesn't need
// the claim; password confirmation is the proof, not the provider's claim).
//
// This guard replaces the global ThrottlerGuard (see app.module.ts) rather
// than being layered on top of it per-route — AuthController/
// UsersController's own comments explain why: @UseGuards(ThrottlerGuard) on
// top of the already-global one runs it twice per request and
// double-counts. Overriding generateKey here is the only way to merge two
// routes' buckets without reintroducing that bug.
const SHARED_PASSWORD_GUESS_HANDLERS: ReadonlySet<string> = new Set([
  'AuthController.login',
  'OidcController.link',
]);

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const handlerKey = `${context.getClass().name}.${context.getHandler().name}`;
    const bucket = SHARED_PASSWORD_GUESS_HANDLERS.has(handlerKey) ? 'shared-password-guess' : handlerKey;
    return `${bucket}-${name}-${suffix}`;
  }
}
