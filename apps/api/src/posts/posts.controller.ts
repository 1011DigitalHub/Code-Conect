import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { JwtPayload, MaybeAuthenticatedRequest } from '../auth/auth.types.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { CREATE_POST_THROTTLE } from '../common/throttle.constants.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { PostCollectionDto, PostEntity } from './entities/post.entity.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // @Public() routes are optionally authenticated (see AuthGuard): an
  // anonymous visitor reads the feed, and a logged-in one additionally gets
  // likedByMe on each post.
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Lista os posts do feed',
    description:
      'Público. Sem `q`, devolve os posts do mais novo para o mais antigo. Com `q`, faz busca full-text em português ordenada por relevância. Qualquer parâmetro de query não documentado resulta em 400.',
  })
  @ApiOkResponse({ type: PostCollectionDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(
    @Query() query: ListPostsQueryDto,
    @Req() req: MaybeAuthenticatedRequest,
  ): Promise<PostCollectionDto> {
    return this.postsService.list(query, req.user?.sub);
  }

  @Throttle({ default: CREATE_POST_THROTTLE })
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publica um post' })
  @ApiCreatedResponse({ type: PostEntity })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Muitas tentativas; veja o header Retry-After',
  })
  async create(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PostEntity> {
    const post = await this.postsService.create(dto, user.sub);
    res.location(post.links.self);
    return post;
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Busca um post pelo slug' })
  @ApiOkResponse({ type: PostEntity })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('slug') slug: string,
    @Req() req: MaybeAuthenticatedRequest,
  ): Promise<PostEntity> {
    return this.postsService.findBySlug(slug, req.user?.sub);
  }

  // The like is a singleton sub-resource scoped to the authenticated viewer,
  // which is why the path is singular and the verbs are PUT/DELETE rather
  // than POST/DELETE on a /likes collection: both are idempotent, so a double
  // click is a no-op instead of a 409.
  @Put(':slug/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Curte um post',
    description: 'Idempotente: curtir de novo mantém uma curtida e devolve 204.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  like(@Param('slug') slug: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.postsService.like(slug, user.sub);
  }

  @Delete(':slug/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a curtida de um post',
    description: 'Idempotente: remover sem ter curtido devolve 204.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  unlike(@Param('slug') slug: string, @CurrentUser() user: JwtPayload): Promise<void> {
    return this.postsService.unlike(slug, user.sub);
  }
}
