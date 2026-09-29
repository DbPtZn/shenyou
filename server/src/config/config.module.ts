import { Global, Module } from "@nestjs/common";
import { ENV, validateEnv, type Env } from "./env";

/** 全局配置模块：启动时 zod 校验全部环境变量，缺失即 fast-fail */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: (): Env => validateEnv(process.env),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
