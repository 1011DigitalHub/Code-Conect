import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../../common/dto/error-response.dto.js';
import { LOGIN_THROTTLE } from '../../common/throttle.constants.js';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  getClearLinkingTokenCookieOptions,
  getCsrfCookieOptions,
  getLinkingTokenCookieName,
  getLinkingTokenCookieOptions,
  getSessionCookieOptions,
} from '../cookie.constants.js';
import { readCookie } from '../cookies.js';
import { mintCsrfToken, sessionKey } from '../csrf.js';
import { LoginResponseDto } from '../dto/login-response.dto.js';
import { NoCsrf } from '../no-csrf.decorator.js';
import { Public } from '../public.decorator.js';
import { LinkAccountDto } from './dto/link-account.dto.js';
import { clearOidcFlowCookie, readOidcFlowCookie, setOidcFlowCookie } from './oidc-flow-cookie.js';
import { generatePkcePair, generateState, statesMatch } from './oidc-pkce.js';
import { getOidcProviderConfig, getWebAppOrigin, parseOidcProvider } from './oidc.constants.js';
import { OidcService } from './oidc.service.js';

// `oidcError=1` is a generic, non-specific flag — it never says *which*
// check failed (expired flow, bad signature, unverified email, the person
// cancelling...), only that the OIDC attempt didn't complete. LoginPage
// reads it to show a FormError instead of leaving the person on /login
// with zero explanation for why they ended up back there (WCAG 3.3.1).
function redirectToLoginWithError(res: Response): void {
  res.redirect(`${getWebAppOrigin()}/login?oidcError=1`);
}

@ApiTags('auth')
@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  // No @Throttle override here: LOGIN_THROTTLE (5/min) is for the one route
  // that actually has a password to brute-force (link, below). This route
  // has nothing to guess, and a tight limit on a plain page navigation means
  // a 429 in raw JSON mid-redirect — easy to hit for anyone behind a shared
  // NAT, or just clicking the button a few times across two providers. The
  // global ThrottlerGuard's DEFAULT_THROTTLE (100/min) still applies, same
  // as every other route — this only opts out of the *tighter* one.
  @Public()
  @NoCsrf()
  @Get(':provider/start')
  @ApiOperation({ summary: 'Inicia o login via OIDC (Google/Microsoft): redireciona para o provedor' })
  @ApiResponse({
    status: 302,
    description:
      'Redireciona para o authorization_endpoint do provedor, ou para /login?oidcError=1 se o provider não estiver configurado — isto é um link clicado numa navegação de página, nunca uma chamada XHR, então nunca deveria devolver um corpo JSON (ver OidcController.callback para o mesmo raciocínio).',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: ':provider desconhecido (rota malformada, não alcançável pelo botão)' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'sob o DEFAULT_THROTTLE global (100/min/IP), não o LOGIN_THROTTLE apertado' })
  start(
    @Param('provider') providerParam: string,
    @Res() res: Response,
  ): void {
    const provider = parseOidcProvider(providerParam);
    // Redirects instead of answering with a raw JSON 404: this route is
    // only ever reached by a browser navigation (a social button's
    // window.location.href, see apps/web/src/api/auth.ts), never an XHR
    // call, and the buttons stay enabled regardless of whether a provider
    // is actually configured — unconfigured is exactly the default
    // docker-compose/dev setup. A JSON error on the API's own origin here
    // would be as jarring as it would be on the callback.
    if (!getOidcProviderConfig(provider).clientId) {
      redirectToLoginWithError(res);
      return;
    }
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePkcePair();

    setOidcFlowCookie(res, { provider, state, codeVerifier });
    res.redirect(this.oidcService.buildAuthorizationUrl(provider, state, codeChallenge));
  }

  // Same reasoning as /start above: no LOGIN_THROTTLE override, just the
  // global DEFAULT_THROTTLE. The provider calls this one back automatically
  // after the person authenticates there, so it's even less under their
  // direct control than /start, and just as wrong to 429 in raw JSON.
  @Public()
  @NoCsrf()
  @Get(':provider/callback')
  @ApiOperation({
    summary: 'Callback do provedor OIDC: valida o retorno e inicia a sessão ou pede vinculação',
  })
  @ApiResponse({
    status: 302,
    description:
      'Login concluído (/perfil), vinculação pendente (/vincular-conta) ou qualquer falha — state/code/id_token inválido, o usuário cancelou no provedor — (/login?oidcError=1, lido pelo LoginPage para mostrar um erro genérico). Essas rejeições nunca viram um corpo JSON: tudo aqui acontece em redirects do navegador que um usuário real está seguindo, não em chamadas XHR.',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: ':provider desconhecido (rota malformada, não alcançável pelo fluxo normal)' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'sob o DEFAULT_THROTTLE global (100/min/IP), não o LOGIN_THROTTLE apertado' })
  async callback(
    @Param('provider') providerParam: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = parseOidcProvider(providerParam);
    const flow = readOidcFlowCookie(req);
    // Single-use regardless of outcome: a replayed callback URL (or one
    // reloaded by the browser) must never succeed twice off the same cookie.
    clearOidcFlowCookie(res);

    // Every one of these — the provider reporting ?error= (the person
    // cancelled/declined at its own consent screen), a missing/mismatched/
    // expired oidc_flow cookie — happens through a browser redirect a real
    // person is driving, not an XHR call. A raw JSON error on the API's own
    // origin mid-navigation would be jarring; bouncing back to /login lets
    // them just try again. (An unrecognized :provider in the route itself
    // is different — see parseOidcProvider above — that's a malformed
    // request, not something reachable by following these redirects.)
    const flowValid =
      !providerError && !!flow && !!state && !!code && flow.provider === provider && statesMatch(flow.state, state);
    if (!flowValid) {
      redirectToLoginWithError(res);
      return;
    }

    let resolution: Awaited<ReturnType<OidcService['authenticate']>>;
    try {
      // TypeScript can't see flowValid's implication that flow/code are
      // defined; the check above already guarantees it.
      resolution = await this.oidcService.authenticate(
        provider,
        code as string,
        (flow as NonNullable<typeof flow>).codeVerifier,
      );
    } catch (error) {
      // A rejection OidcService itself raises on purpose (bad signature,
      // wrong aud, unverified email, ...) — same reasoning as above, bounce
      // to /login rather than show it as JSON. Anything else is a genuine
      // bug, not a rejection anyone designed; let it propagate so
      // AllExceptionsFilter still logs and 500s it instead of silently
      // masking a real failure as "please try again".
      if (!(error instanceof HttpException)) throw error;
      redirectToLoginWithError(res);
      return;
    }

    if (resolution.kind === 'linkingRequired') {
      res.cookie(getLinkingTokenCookieName(), resolution.linkingToken, getLinkingTokenCookieOptions());
      res.redirect(`${getWebAppOrigin()}/vincular-conta?provider=${provider}`);
      return;
    }

    // A leftover linking_token from an earlier, abandoned /vincular-conta
    // attempt (same browser, different login) would otherwise just sit
    // there until its own 5-minute exp — harmless (it's single-use and
    // bound to that attempt's own email/provider/providerSub), but there is
    // no reason to leave it once this request is signing the person in
    // through a completely different path.
    res.clearCookie(getLinkingTokenCookieName(), getClearLinkingTokenCookieOptions());

    const session = await this.oidcService.mintSession(resolution.user);
    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, getSessionCookieOptions(false, session.expiresIn));
    const csrfToken = mintCsrfToken(sessionKey(session.accessToken));
    res.cookie(CSRF_COOKIE, csrfToken, getCsrfCookieOptions(false, session.expiresIn));
    res.redirect(`${getWebAppOrigin()}/perfil`);
  }

  // Unlike /start and /callback, this is a same-site XHR from
  // /vincular-conta (not a browser navigation), so it goes through the
  // normal CsrfGuard like /auth/login — no @NoCsrf() here. LOGIN_THROTTLE
  // here shares its bucket with AuthController.login (round 13 of
  // plan/LoginSocial.md's review — see common/login-throttler.guard.ts):
  // both check a password against the same account, and minting a
  // linking_token to attempt here costs an attacker nothing (any email,
  // regardless of email_verified, on the password-collision branch — see
  // OidcService.resolveIdentity), so leaving these as two independent
  // buckets would double an attacker's guesses/min against one account.
  @Public()
  @Throttle({ default: LOGIN_THROTTLE })
  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirma a vinculação de uma identidade OIDC a uma conta local, com senha' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'linking_token ausente/expirado/inválido, ou senha incorreta — mesma mensagem genérica para os dois',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'essa identidade já foi vinculada a uma conta (reenvio do mesmo linking_token já usado, ou corrida)',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Token CSRF ausente ou inválido — esta rota passa pelo CsrfGuard normal, sem @NoCsrf()',
  })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async link(
    @Body() dto: LinkAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const linkingToken = readCookie(req, getLinkingTokenCookieName());
    // Unlike the callback's oidc_flow cookie, this one is NOT cleared up
    // front: a wrong password is exactly as retriable as a wrong password
    // on /auth/login (same LOGIN_THROTTLE bounds the attempts either way),
    // and the linking_token's own 5-minute exp already bounds how long it
    // can be retried against. It IS cleared on a 409 below, same as on
    // success — that specific token can never succeed on a later retry
    // (the identity it names is already linked, by this same request
    // racing another one or by a straight replay), so there is nothing to
    // retry towards; leaving the cookie in place would just offer a dead
    // end until it expires on its own.
    let session;
    try {
      session = await this.oidcService.linkAccount(linkingToken, dto.password);
    } catch (error) {
      if (error instanceof ConflictException) {
        res.clearCookie(getLinkingTokenCookieName(), getClearLinkingTokenCookieOptions());
      }
      throw error;
    }
    res.clearCookie(getLinkingTokenCookieName(), getClearLinkingTokenCookieOptions());

    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, getSessionCookieOptions(false, session.expiresIn));
    const csrfToken = mintCsrfToken(sessionKey(session.accessToken));
    res.cookie(CSRF_COOKIE, csrfToken, getCsrfCookieOptions(false, session.expiresIn));

    return { tokenType: session.tokenType, expiresIn: session.expiresIn };
  }
}
