import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

// No imports needed: PrismaModule is @Global() and JwtModule is registered
// globally by AuthModule, which is what lets the global AuthGuard resolve.
@Module({
  controllers: [PostsController, CommentsController],
  providers: [PostsService, CommentsService],
})
export class PostsModule {}
