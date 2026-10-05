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
  providers: [AuthService],
})
export class AuthModule {}
