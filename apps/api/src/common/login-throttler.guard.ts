import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from '../auth/auth.controller.js';
import { OidcController } from '../auth/oidc/oidc.controller.js';

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
//
// Built from the actual classes/methods (round 14 of plan/LoginSocial.md's
// review), not string literals: renaming AuthController.login or
// OidcController.link would otherwise silently stop sharing the bucket,
// with nothing — not even the unit test, which only exercises generateKey
// in isolation — ever flagging it. `AuthController.prototype.login` fails
// to compile the moment that method is renamed or removed, which a plain
// 'AuthController.login' string never would.
//
// Reading these at module-evaluation time means a future import cycle
// through this file (none exists today — neither controller imports
// anything that leads back here) would risk a TDZ ReferenceError on
// AuthController/OidcController instead of failing more legibly elsewhere.
// Worth knowing if a cycle ever gets introduced, not worth guarding against
// with no cycle to guard against yet.
const SHARED_PASSWORD_GUESS_HANDLERS: ReadonlySet<string> = new Set([
  `${AuthController.name}.${AuthController.prototype.login.name}`,
  `${OidcController.name}.${OidcController.prototype.link.name}`,
]);

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
    const handlerKey = `${context.getClass().name}.${context.getHandler().name}`;
    const bucket = SHARED_PASSWORD_GUESS_HANDLERS.has(handlerKey) ? 'shared-password-guess' : handlerKey;
    return `${bucket}-${name}-${suffix}`;
  }
}
