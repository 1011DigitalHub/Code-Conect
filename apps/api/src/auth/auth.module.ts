import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import {
  getJwtSecret,
  JWT_ALGORITHM,
  JWT_EXPIRES_IN_SECONDS,
} from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { OidcModule } from './oidc/oidc.module.js';

// AuthGuard and CsrfGuard are registered as global APP_GUARDs in AppModule,
// not here, alongside ThrottlerGuard — so their relative order is explicit
// in one place instead of split across modules. JwtModule being global
// (below) is what lets AppModule construct an AuthGuard without importing
// this module's providers directly.
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: JWT_EXPIRES_IN_SECONDS, algorithm: JWT_ALGORITHM },
      verifyOptions: { algorithms: [JWT_ALGORITHM] },
    }),
    OidcModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
