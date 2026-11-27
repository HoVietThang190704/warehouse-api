import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  onModuleInit() {
    // Lazy connect on first query in serverless/Vercel environment
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
