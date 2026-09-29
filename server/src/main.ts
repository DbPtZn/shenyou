// 必须先加载 .env，ConfigModule 的 zod 校验依赖它。
// 显式按「本包优先、根目录兜底」解析，避免依赖进程 cwd（dist/main.js → server/.env）。
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: [resolve(__dirname, "../.env"), resolve(__dirname, "../../.env")] });

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/global-exception.filter";
import { TransformInterceptor } from "./common/transform.interceptor";
import { ENV, type Env } from "./config/env";

async function bootstrap(): Promise<void> {
  // rawBody：RevenueCat webhook HMAC 必须对原始字节计算（解析后重序列化会失真）
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  // 结构化日志：pino，requestId 贯穿全链路
  app.useLogger(app.get(Logger));

  // 安全头 + CORS 显式白名单（来自 env，生产禁止 *）
  app.use(helmet());
  const env = app.get<Env>(ENV);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });

  // 全局管道（whitelist 剥离未声明字段）/ 统一错误结构 / 统一响应封装
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // 优雅停机：SIGTERM/SIGINT 时触发 onModuleDestroy（断开 Prisma 等）
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}

void bootstrap();
