// 必须先加载 .env，ConfigModule 的 zod 校验依赖它。
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: [resolve(__dirname, "../.env"), resolve(__dirname, "../../.env")] });

// 标记为 worker 进程，PipelineWorker.onModuleInit 据此启动 BullMQ Worker
process.env.ROLE = "worker";

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

/**
 * AI 内容管线 Worker 进程入口。
 * 独立于 API 进程运行：pnpm start:worker
 * 不监听 HTTP 端口，只消费 BullMQ 队列。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  // 不调用 app.listen() —— Worker 进程无 HTTP 服务
  // eslint-disable-next-line no-console
  console.log("[pipeline-worker] started");
}

void bootstrap();
