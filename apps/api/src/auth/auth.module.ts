import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import {
  getJwtSecret,
  JWT_ALGORITHM,
  JWT_EXPIRES_IN_SECONDS,
} from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: JWT_EXPIRES_IN_SECONDS, algorithm: JWT_ALGORITHM },
      verifyOptions: { algorithms: [JWT_ALGORITHM] },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Global guards run in registration order: AuthGuard first, so a
    // request with no session gets 401 rather than a CSRF 403. CsrfGuard
    // derives its key from the raw access_token cookie (not request.user),
    // so it is functionally order-independent — the order only decides
    // which status code wins when both would reject.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AuthModule {}
