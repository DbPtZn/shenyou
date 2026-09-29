import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  // JwtAuthGuard 依赖 JwtService，secret 在校验时传入
  imports: [JwtModule.register({})],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
