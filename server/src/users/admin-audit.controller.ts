import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../content/admin.guard";
import { AdminUsersService } from "./admin-users.service";
import { AdminAuditLogQueryDto } from "./dto/admin-users.dto";

/**
 * 管理端操作审计日志查询（用户角色/订阅状态等敏感变更，写入侧在 AdminUsersService 同事务落库）。
 * 全部要求 admin 角色。
 */
@Controller("admin/audit-logs")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  /** GET /admin/audit-logs —— 审计日志列表（分页 + field/keyword 筛选） */
  @Get()
  listAuditLogs(@Query() query: AdminAuditLogQueryDto) {
    return this.adminUsersService.listAuditLogs(query);
  }
}
