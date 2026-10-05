import { Body, Controller, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import { SIGN_UP_THROTTLE } from '../common/throttle.constants.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ThrottlerGuard itself is global now (see AppModule); @Throttle just
  // overrides the 'default' named throttler's limit for this route — adding
  // @UseGuards(ThrottlerGuard) here too would run the guard twice per
  // request and double-count against that same limit.
  @Public()
  @Throttle({ default: SIGN_UP_THROTTLE })
  @Post()
  @ApiOperation({ summary: 'Cadastra um usuário' })
  @ApiCreatedResponse({ type: UserEntity })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Muitas tentativas; veja o header Retry-After',
  })
  async create(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserEntity> {
    const user = await this.usersService.create(dto);
    res.location(user.links.self);
    return user;
  }
}
