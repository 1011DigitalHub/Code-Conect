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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { LOGIN_THROTTLE } from '../common/throttle.constants.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import type { JwtPayload } from './auth.types.js';
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
import { TokenResponseDto } from './dto/token-response.dto.js';
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

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: LOGIN_THROTTLE })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica o usuário e devolve um JWT' })
  @ApiOkResponse({ type: TokenResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Muitas tentativas; veja o header Retry-After',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const remember = dto.remember ?? false;
    const result = await this.authService.signIn(dto.email, dto.password, remember);
    // Bridge phase: the token still travels in the body too (accessToken),
    // for the web app until it switches to reading only the cookie.
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
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerra a sessão, limpando os cookies' })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(ACCESS_TOKEN_COOKIE, getClearCookieOptions());
    res.clearCookie(CSRF_COOKIE, getClearCookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
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
