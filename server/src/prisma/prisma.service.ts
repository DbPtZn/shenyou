import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** 优雅停机：配合 main.ts 的 enableShutdownHooks，进程退出前断开连接 */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
