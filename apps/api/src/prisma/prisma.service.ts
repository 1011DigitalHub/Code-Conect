import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { getDatabaseUrl } from './database.constants.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
      // Defence in depth: passwordHash never comes back from a query unless
      // a call site explicitly opts back in (see UsersService.findByEmail,
      // the one place that actually needs it to verify a login). Without
      // this, the only thing stopping the hash from leaking into a log, an
      // error dump or a future endpoint is every call site remembering not
      // to touch the field.
      omit: { user: { passwordHash: true } },
    });
  }

  // Connect on startup so the API fails fast when the database is down.
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
