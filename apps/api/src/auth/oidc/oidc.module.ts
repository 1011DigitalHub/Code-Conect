import { Module } from '@nestjs/common';
import { UsersModule } from '../../users/users.module.js';
import { OidcController } from './oidc.controller.js';
import { OidcService } from './oidc.service.js';

@Module({
  imports: [UsersModule],
  controllers: [OidcController],
  providers: [OidcService],
})
export class OidcModule {}
