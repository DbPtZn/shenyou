import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AdminGuard } from "../content/admin.guard";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  // JwtAuthGuard 依赖 JwtService，secret 在校验时传入；AdminGuard 依赖全局 PrismaService
  imports: [JwtModule.register({})],
  controllers: [UsersController, AdminUsersController, AdminAuditController],
  providers: [UsersService, AdminUsersService, AdminGuard],
})
export class UsersModule {}
