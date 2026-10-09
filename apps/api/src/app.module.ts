import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { CsrfGuard } from './auth/csrf.guard.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { DEFAULT_THROTTLE } from './common/throttle.constants.js';
import { HealthModule } from './health/health.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ...DEFAULT_THROTTLE }]),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    PostsModule,
  ],
  controllers: [AppController],
  providers: [
    // All three global guards live in this one array, so their order is
    // explicit and doesn't depend on Nest's cross-module resolution order
    // (which isn't guaranteed for APP_GUARD providers declared in different
    // modules — this used to be split between here and AuthModule).
    //
    // Rate limiting runs first: it must count a request even when the next
    // guard would reject it, or an unauthenticated flood against a
    // protected route is never actually limited (a guard that throws stops
    // the chain, so anything after it never runs). Then AuthGuard, so a
    // request with no session gets 401 rather than a CSRF 403. CsrfGuard
    // derives its key from the raw access_token cookie (not request.user),
    // so it is functionally order-independent with AuthGuard — that order
    // only decides which status code wins when both would reject.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    // Runs after the guards: a guard's own rejection (401/403/429) is
    // already an HttpException and passes through this filter unchanged.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

