<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索手机号 / 邮箱 / 昵称"
        clearable
        class="toolbar__keyword"
        @keyup.enter="onSearch"
        @clear="onSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="onSearch" />
        </template>
      </el-input>
      <el-select v-model="query.role" clearable placeholder="角色" class="toolbar__filter" @change="onSearch">
        <el-option v-for="r in USER_ROLES" :key="r" :label="USER_ROLE_MAP[r].label" :value="r" />
      </el-select>
      <el-select
        v-model="query.subscriptionStatus"
        clearable
        placeholder="订阅状态"
        class="toolbar__filter"
        @change="onSearch"
      >
        <el-option
          v-for="s in SUBSCRIPTION_STATUSES"
          :key="s"
          :label="SUBSCRIPTION_STATUS_MAP[s].label"
          :value="s"
        />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="rows">
      <el-table-column label="账号" min-width="180">
        <template #default="{ row }">
          <div>{{ row.phone || row.email || "—" }}</div>
          <div class="cell-sub">{{ row.nickname || "未设置昵称" }}</div>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="170">
        <template #default="{ row }">
          <el-select
            :model-value="row.role"
            size="small"
            :disabled="row.id === myId"
            @change="(v: UserRole) => onRoleChange(row, v)"
          >
            <el-option v-for="r in USER_ROLES" :key="r" :label="USER_ROLE_MAP[r].label" :value="r" />
          </el-select>
          <el-tooltip v-if="row.id === myId" content="不能修改自己的角色" placement="top">
            <span class="self-hint">（我）</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="订阅状态" width="170">
        <template #default="{ row }">
          <el-select
            :model-value="row.subscriptionStatus"
            size="small"
            @change="(v: SubscriptionStatus) => onSubscriptionChange(row, v)"
          >
            <el-option
              v-for="s in SUBSCRIPTION_STATUSES"
              :key="s"
              :label="SUBSCRIPTION_STATUS_MAP[s].label"
              :value="s"
            />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="权益到期" width="150">
        <template #default="{ row }">
          <span v-if="row.entitlement?.expirationAt">
            {{ formatDateTime(row.entitlement.expirationAt) }}
          </span>
          <span v-else class="cell-sub">—</span>
          <div v-if="row.entitlement" class="cell-sub">
            {{ row.entitlement.environment === "sandbox" ? "沙盒" : "生产" }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="150">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <template #empty>
        <el-empty description="没有匹配的用户" />
      </template>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pager"
      @change="load"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search } from "@element-plus/icons-vue";
import { SUBSCRIPTION_STATUSES, USER_ROLES } from "@shenyou/shared";
import type { SubscriptionStatus, UserRole } from "@shenyou/shared";
import { fetchUsers, updateUserRole, updateUserSubscription } from "@/api/users";
import { SUBSCRIPTION_STATUS_MAP, USER_ROLE_MAP } from "@/utils/status";
import { formatDateTime } from "@/utils/format";
import { useAuthStore } from "@/stores/auth";
import type { AdminUserListItem } from "@/types/api";

const authStore = useAuthStore();
const myId = computed(() => authStore.profile?.id ?? "");

const loading = ref(false);
const rows = ref<AdminUserListItem[]>([]);
const total = ref(0);

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: "",
  role: undefined as UserRole | undefined,
  subscriptionStatus: undefined as SubscriptionStatus | undefined,
});

async function load() {
  loading.value = true;
  try {
    const data = await fetchUsers({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.subscriptionStatus ? { subscriptionStatus: query.subscriptionStatus } : {}),
    });
    rows.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  query.page = 1;
  void load();
}

/** 危险操作：二次确认后才提交 */
async function onRoleChange(row: AdminUserListItem, role: UserRole) {
  if (role === row.role) return;
  const label = USER_ROLE_MAP[role].label;
  try {
    await ElMessageBox.confirm(
      `确定将「${row.phone || row.email || row.id}」的角色改为「${label}」吗？`,
      "修改角色",
      { confirmButtonText: "确认修改", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return; // 用户取消
  }
  await updateUserRole(row.id, role);
  ElMessage.success("角色已更新");
  await load();
}

async function onSubscriptionChange(row: AdminUserListItem, status: SubscriptionStatus) {
  if (status === row.subscriptionStatus) return;
  const label = SUBSCRIPTION_STATUS_MAP[status].label;
  try {
    await ElMessageBox.confirm(
      `确定将「${row.phone || row.email || row.id}」的订阅状态改为「${label}」吗？`,
      "修改订阅状态",
      { confirmButtonText: "确认修改", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return;
  }
  await updateUserSubscription(row.id, status);
  ElMessage.success("订阅状态已更新");
  await load();
}

onMounted(load);
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.toolbar__keyword {
  width: 280px;
}
.toolbar__filter {
  width: 160px;
}
.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.self-hint {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
