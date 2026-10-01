<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索操作人 / 目标账号"
        clearable
        class="toolbar__keyword"
        @keyup.enter="onSearch"
        @clear="onSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="onSearch" />
        </template>
      </el-input>
      <el-select v-model="query.field" clearable placeholder="变更字段" class="toolbar__filter" @change="onSearch">
        <el-option label="角色 (role)" value="role" />
        <el-option label="订阅状态 (subscriptionStatus)" value="subscriptionStatus" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="rows">
      <el-table-column label="时间" width="165">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作人" min-width="160">
        <template #default="{ row }">
          <div>{{ row.adminAccount }}</div>
          <div class="cell-sub">ID: {{ row.adminUserId.slice(0, 8) }}…</div>
        </template>
      </el-table-column>
      <el-table-column label="目标用户" min-width="160">
        <template #default="{ row }">
          <div>{{ row.targetAccount }}</div>
          <div class="cell-sub">ID: {{ row.targetUserId.slice(0, 8) }}…</div>
        </template>
      </el-table-column>
      <el-table-column label="变更字段" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ fieldLabel(row.field) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="变更" min-width="220">
        <template #default="{ row }">
          <span class="audit-before">{{ displayValue(row.field, row.before) }}</span>
          <span class="audit-arrow">→</span>
          <span class="audit-after">{{ displayValue(row.field, row.after) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      v-model:page-size="query.pageSize"
      :total="total"
      :page-sizes="[10, 20, 50]"
      layout="total, sizes, prev, pager, next"
      class="pager"
      @change="load"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Search } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { fetchAuditLogs } from "@/api/audit";
import type { AdminAuditField, AdminAuditLogItem } from "@/types/api";
import { USER_ROLE_MAP, SUBSCRIPTION_STATUS_MAP } from "@/utils/status";

const rows = ref<AdminAuditLogItem[]>([]);
const total = ref(0);
const loading = ref(false);
const query = reactive({
  page: 1,
  pageSize: 20,
  field: undefined as AdminAuditField | undefined,
  keyword: "",
});

function fieldLabel(field: AdminAuditField): string {
  return field === "role" ? "角色" : "订阅状态";
}

function displayValue(field: AdminAuditField, raw: string): string {
  if (field === "role") return USER_ROLE_MAP[raw as keyof typeof USER_ROLE_MAP]?.label ?? raw;
  if (field === "subscriptionStatus")
    return SUBSCRIPTION_STATUS_MAP[raw as keyof typeof SUBSCRIPTION_STATUS_MAP]?.label ?? raw;
  return raw;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

async function load() {
  loading.value = true;
  try {
    const res = await fetchAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
      field: query.field,
      keyword: query.keyword || undefined,
    });
    rows.value = res.items;
    total.value = res.total;
  } catch (err: unknown) {
    ElMessage.error(String(err));
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  query.page = 1;
  load();
}

onMounted(() => load());
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.toolbar__keyword {
  width: 320px;
}
.toolbar__filter {
  width: 180px;
}
.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.audit-before {
  color: var(--el-text-color-secondary);
  text-decoration: line-through;
}
.audit-arrow {
  margin: 0 8px;
  color: var(--el-text-color-placeholder);
}
.audit-after {
  color: var(--el-color-primary);
  font-weight: 500;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
