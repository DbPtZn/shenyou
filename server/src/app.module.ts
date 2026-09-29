import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ConfigModule } from "./config/config.module";
import { ENV, type Env } from "./config/env";
import { ContentModule } from "./content/content.module";
import { HealthModule } from "./health/health.module";
import { PipelineModule } from "./pipeline/pipeline.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === "production" ? "info" : "debug",
          // requestId 贯穿：优先沿用上游 x-request-id，否则生成；同时回写响应头
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const incoming = req.headers["x-request-id"];
            const requestId =
              typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
            res.setHeader("x-request-id", requestId);
            return requestId;
          },
          // 绝不记录 token / cookie（CLAUDE.md §4）
          redact: {
            paths: ["req.headers.authorization", "req.headers.cookie"],
            censor: "[redacted]",
          },
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    BillingModule,
    ContentModule,
    PipelineModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
