import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
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
import type { JwtPayload } from '../auth/auth.types.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CREATE_COMMENT_THROTTLE } from '../common/throttle.constants.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import {
  CommentCollectionDto,
  CommentEntity,
} from './entities/comment.entity.js';

@ApiTags('comments')
@Controller('posts/:slug/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lista os comentários de um post' })
  @ApiOkResponse({ type: CommentCollectionDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  list(
    @Param('slug') slug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<CommentCollectionDto> {
    return this.commentsService.list(slug, query);
  }

  @Throttle({ default: CREATE_COMMENT_THROTTLE })
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Comenta em um post' })
  @ApiCreatedResponse({ type: CommentEntity })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Muitas tentativas; veja o header Retry-After',
  })
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CommentEntity> {
    const comment = await this.commentsService.create(slug, dto, user.sub);
    res.location(comment.links.self);
    return comment;
  }

  // Exists so the Location header of the POST above is dereferenceable.
  @Public()
  @Get(':commentId')
  @ApiOperation({ summary: 'Busca um comentário' })
  @ApiOkResponse({ type: CommentEntity })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('slug') slug: string,
    @Param('commentId', ParseIntPipe) commentId: number,
  ): Promise<CommentEntity> {
    return this.commentsService.findOne(slug, commentId);
  }
}
