import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { LOGIN_THROTTLE } from '../common/throttle.constants.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { JwtPayload, MaybeAuthenticatedRequest } from './auth.types.js';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  getClearCookieOptions,
  getCsrfCookieOptions,
  getSessionCookieOptions,
} from './cookie.constants.js';
import { readCookie } from './cookies.js';
import { CurrentUser } from './current-user.decorator.js';
import { mintCsrfToken, sessionKey } from './csrf.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginResponseDto } from './dto/login-response.dto.js';
import { SessionResponseDto } from './dto/session-response.dto.js';
import { NoCsrf } from './no-csrf.decorator.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // Bootstrap: lets an anonymous visitor (or one whose csrf_token expired)
  // fetch a fresh token before any mutation. @NoCsrf() is redundant with the
  // GET-is-safe exemption in CsrfGuard, kept here only as documentation.
  @Public()
  @NoCsrf()
  @Get('csrf')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Emite o cookie csrf_token para o bootstrap do front' })
  @ApiNoContentResponse()
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    const accessToken = readCookie(req, ACCESS_TOKEN_COOKIE);
    const token = mintCsrfToken(sessionKey(accessToken));
    res.cookie(CSRF_COOKIE, token, getCsrfCookieOptions(false, 0));
  }

  // ThrottlerGuard itself is global now (see AppModule); @Throttle just
  // overrides the 'default' named throttler's limit for this route — adding
  // @UseGuards(ThrottlerGuard) here too would run the guard twice per
  // request and double-count against that same limit.
  @Public()
  @Throttle({ default: LOGIN_THROTTLE })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica o usuário e inicia a sessão em um cookie httpOnly' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Muitas tentativas; veja o header Retry-After',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const remember = dto.remember ?? false;
    const result = await this.authService.signIn(dto.email, dto.password, remember);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      result.accessToken,
      getSessionCookieOptions(remember, result.expiresIn),
    );
    // Rotate the CSRF token bound to the NEW access token, not whatever
    // access_token cookie (if any) the request happened to carry — a stale
    // or anonymous session key here would mint a token that doesn't
    // validate against the session that was just created.
    const csrfToken = mintCsrfToken(sessionKey(result.accessToken));
    res.cookie(CSRF_COOKIE, csrfToken, getCsrfCookieOptions(remember, result.expiresIn));
    // The session itself stays in the cookie; the body never carries the
    // raw token (see LoginResponseDto and SignInResult's doc comment).
    return { tokenType: result.tokenType, expiresIn: result.expiresIn };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth('cookie')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Encerra a sessão, limpando os cookies' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Token CSRF ausente ou inválido',
  })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, getClearCookieOptions());
    res.clearCookie(CSRF_COOKIE, getClearCookieOptions());
  }

  // The public counterpart of GET /auth/me, for a page that has to render for
  // anonymous and logged-in visitors alike (the feed). /auth/me answers 401
  // without a session — right for a private page, but on a public one the
  // browser logs that 401 to the console, which trips both the no-console-
  // errors browser suite and Lighthouse's scored best-practices audit. This
  // answers 200 with `user: null` instead.
  //
  // /auth/me deliberately keeps its 401: besides serving the private profile
  // page, it is the canary proving the global guard is fail-closed
  // (test/guard.e2e-spec.ts).
  @Public()
  @Get('session')
  @ApiOperation({
    summary: 'Sessão atual, se houver',
    description:
      'Público. Devolve `user: null` para um visitante anônimo em vez de 401, para que uma página pública possa se adaptar à sessão sem gerar erro no console do navegador.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  async session(
    @Req() req: MaybeAuthenticatedRequest,
  ): Promise<SessionResponseDto> {
    // @Public() routes are optionally authenticated (see AuthGuard): req.user
    // is set when a valid cookie came along, and absent otherwise.
    const sub = req.user?.sub;
    if (sub === undefined) return { user: null };

    try {
      return { user: await this.usersService.findById(sub) };
    } catch (error) {
      // A valid token for a user that no longer exists is simply not a session.
      if (error instanceof NotFoundException) return { user: null };
      throw error;
    }
  }

  @Get('me')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Dados do usuário logado' })
  @ApiOkResponse({ type: UserEntity })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async me(@CurrentUser() user: JwtPayload): Promise<UserEntity> {
    try {
      return await this.usersService.findById(user.sub);
    } catch (error) {
      // A valid token for a user that no longer exists is not authenticated.
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException();
      }
      throw error;
    }
  }
}
