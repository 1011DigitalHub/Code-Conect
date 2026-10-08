import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
  getCsrfCookieOptions,
  getLinkingTokenCookieOptions,
  getClearOidcCookieOptions,
  getSessionCookieOptions,
  LINKING_TOKEN_COOKIE,
} from '../cookie.constants.js';
import { readCookie } from '../cookies.js';
import { mintCsrfToken, sessionKey } from '../csrf.js';
import { LoginResponseDto } from '../dto/login-response.dto.js';
import { NoCsrf } from '../no-csrf.decorator.js';
import { Public } from '../public.decorator.js';
import { LinkAccountDto } from './dto/link-account.dto.js';
import { clearOidcFlowCookie, readOidcFlowCookie, setOidcFlowCookie } from './oidc-flow-cookie.js';
import { generatePkcePair, generateState, statesMatch } from './oidc-pkce.js';
import { getWebAppOrigin, parseOidcProvider } from './oidc.constants.js';
import { OidcService } from './oidc.service.js';

@ApiTags('auth')
@Controller('auth/oidc')
export class OidcController {
  constructor(private readonly oidcService: OidcService) {}

  @Public()
  @NoCsrf()
  @Throttle({ default: LOGIN_THROTTLE })
  @Get(':provider/start')
  @ApiOperation({ summary: 'Inicia o login via OIDC (Google/Microsoft): redireciona para o provedor' })
  @ApiResponse({ status: 302, description: 'Redireciona para o authorization_endpoint do provedor' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'provider desconhecido' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  start(
    @Param('provider') providerParam: string,
    @Res() res: Response,
  ): void {
    const provider = parseOidcProvider(providerParam);
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePkcePair();

    setOidcFlowCookie(res, { provider, state, codeVerifier });
    res.redirect(this.oidcService.buildAuthorizationUrl(provider, state, codeChallenge));
  }

  @Public()
  @NoCsrf()
  @Throttle({ default: LOGIN_THROTTLE })
  @Get(':provider/callback')
  @ApiOperation({
    summary: 'Callback do provedor OIDC: valida o retorno e inicia a sessão ou pede vinculação',
  })
  @ApiResponse({
    status: 302,
    description: 'Login concluído (redireciona para /perfil) ou vinculação pendente (redireciona para /vincular-conta)',
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'state/code ausente, inválido ou expirado' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'id_token inválido (assinatura, iss ou aud)' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async callback(
    @Param('provider') providerParam: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = parseOidcProvider(providerParam);
    const flow = readOidcFlowCookie(req);
    // Single-use regardless of outcome: a replayed callback URL (or one
    // reloaded by the browser) must never succeed twice off the same cookie.
    clearOidcFlowCookie(res);

    const flowValid =
      !!flow && !!state && flow.provider === provider && statesMatch(flow.state, state);
    if (!flowValid || !code) {
      throw new BadRequestException('Fluxo OIDC inválido ou expirado');
    }

    // TypeScript can't see flowValid's implication that flow is defined;
    // the check above already guarantees it.
    const resolution = await this.oidcService.authenticate(provider, code, (flow as NonNullable<typeof flow>).codeVerifier);

    if (resolution.kind === 'linkingRequired') {
      res.cookie(LINKING_TOKEN_COOKIE, resolution.linkingToken, getLinkingTokenCookieOptions());
      res.redirect(`${getWebAppOrigin()}/vincular-conta?provider=${provider}`);
      return;
    }

    const session = await this.oidcService.mintSession(resolution.user);
    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, getSessionCookieOptions(false, session.expiresIn));
    const csrfToken = mintCsrfToken(sessionKey(session.accessToken));
    res.cookie(CSRF_COOKIE, csrfToken, getCsrfCookieOptions(false, session.expiresIn));
    res.redirect(`${getWebAppOrigin()}/perfil`);
  }

  // Unlike /start and /callback, this is a same-site XHR from
  // /vincular-conta (not a browser navigation), so it goes through the
  // normal CsrfGuard like /auth/login — no @NoCsrf() here.
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
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto })
  async link(
    @Body() dto: LinkAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const linkingToken = readCookie(req, LINKING_TOKEN_COOKIE);
    // Single-use regardless of outcome, same reasoning as the callback's
    // oidc_flow cookie: cleared as soon as it's read, before the token is
    // even validated, so a failed attempt can't be retried against the
    // same cookie.
    res.clearCookie(LINKING_TOKEN_COOKIE, getClearOidcCookieOptions());

    const session = await this.oidcService.linkAccount(linkingToken, dto.password);

    res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, getSessionCookieOptions(false, session.expiresIn));
    const csrfToken = mintCsrfToken(sessionKey(session.accessToken));
    res.cookie(CSRF_COOKIE, csrfToken, getCsrfCookieOptions(false, session.expiresIn));

    return { tokenType: session.tokenType, expiresIn: session.expiresIn };
  }
}
