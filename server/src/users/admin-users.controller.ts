import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard, type AuthenticatedUser } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../content/admin.guard";
import { AdminUsersService } from "./admin-users.service";
import {
  AdminUserQueryDto,
  UpdateUserRoleDto,
  UpdateUserSubscriptionDto,
} from "./dto/admin-users.dto";

/**
 * 管理端用户管理：列表查询、角色与订阅状态维护。
 * 全部要求 admin 角色；响应绝不包含 passwordHash 与 token 字段。
 */
@Controller("admin/users")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  /** GET /admin/users —— 用户列表（分页 + keyword/role/subscriptionStatus 筛选） */
  @Get()
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  /** PATCH /admin/users/:id/role —— 修改角色（不能修改自己） */
  @Patch(":id/role")
  updateRole(
    @Param("id") id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminUsersService.updateRole(user.userId, id, dto.role);
  }

  /** PATCH /admin/users/:id/subscription —— 修改订阅状态 */
  @Patch(":id/subscription")
  updateSubscription(
    @Param("id") id: string,
    @Body() dto: UpdateUserSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.adminUsersService.updateSubscription(user.userId, id, dto.status);
  }
}
