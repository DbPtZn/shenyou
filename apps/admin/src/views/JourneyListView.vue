<template>
  <div>
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        placeholder="搜索标题 / 副标题"
        clearable
        class="toolbar__keyword"
        @keyup.enter="onSearch"
        @clear="onSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="onSearch" />
        </template>
      </el-input>
      <el-select
        v-model="query.status"
        multiple
        collapse-tags
        placeholder="状态筛选"
        class="toolbar__filter"
        @change="onSearch"
      >
        <el-option
          v-for="s in CONTENT_STATUSES"
          :key="s"
          :label="CONTENT_STATUS_MAP[s].label"
          :value="s"
        />
      </el-select>
      <el-select
        v-model="query.tags"
        multiple
        filterable
        allow-create
        collapse-tags
        placeholder="标签筛选"
        class="toolbar__filter"
        @change="onSearch"
      >
        <el-option v-for="t in knownTags" :key="t" :label="t" :value="t" />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="router.push('/journeys/new')">
        新建旅程
      </el-button>
    </div>

    <el-table v-loading="loading" :data="rows" class="table">
      <el-table-column prop="title" label="标题" min-width="180">
        <template #default="{ row }: { row: AdminJourneyListItem }">
          <div class="cell-title">{{ row.title }}</div>
          <div class="cell-subtitle">{{ row.subtitle || "—" }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }: { row: AdminJourneyListItem }">
          <el-tag :type="CONTENT_STATUS_MAP[row.status].type" effect="dark" size="small">
            {{ CONTENT_STATUS_MAP[row.status].label }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="标签" min-width="140">
        <template #default="{ row }: { row: AdminJourneyListItem }">
          <el-tag
            v-for="t in row.tags"
            :key="t"
            size="small"
            effect="plain"
            class="tag-item"
          >
            {{ t }}
          </el-tag>
          <span v-if="!row.tags.length" class="cell-subtitle">—</span>
        </template>
      </el-table-column>
      <el-table-column label="章节" width="70" align="center">
        <template #default="{ row }: { row: AdminJourneyListItem }">{{ row.chapterCount }}</template>
      </el-table-column>
      <el-table-column label="免费" width="70" align="center">
        <template #default="{ row }: { row: AdminJourneyListItem }">
          <el-tag :type="row.isFree ? 'success' : 'warning'" size="small" effect="plain">
            {{ row.isFree ? "免费" : "会员" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="总时长" width="90" align="center">
        <template #default="{ row }: { row: AdminJourneyListItem }">{{ formatDuration(row.totalDurationSec) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="150">
        <template #default="{ row }: { row: AdminJourneyListItem }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }: { row: AdminJourneyListItem }">
          <el-button link type="primary" @click="router.push(`/journeys/${row.id}`)">
            编辑
          </el-button>
          <el-button
            v-if="row.status !== 'published'"
            link
            type="success"
            @click="onPublish(row)"
          >
            发布
          </el-button>
          <el-button
            v-if="row.status === 'published'"
            link
            type="warning"
            @click="onOffline(row)"
          >
            下架
          </el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无旅程，点击右上角新建" />
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
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Search } from "@element-plus/icons-vue";
import { CONTENT_STATUSES } from "@shenyou/shared";
import { fetchJourneys, updateJourney, deleteJourney } from "@/api/journeys";
import { CONTENT_STATUS_MAP } from "@/utils/status";
import { formatDateTime, formatDuration } from "@/utils/format";
import type { AdminJourneyListItem, ContentStatus } from "@/types/api";

const router = useRouter();

const loading = ref(false);
const rows = ref<AdminJourneyListItem[]>([]);
const total = ref(0);
const knownTags = ref<string[]>([]);

const query = reactive({
  page: 1,
  pageSize: 20,
  keyword: "",
  status: [] as ContentStatus[],
  tags: [] as string[],
});

async function load() {
  loading.value = true;
  try {
    const data = await fetchJourneys({
      page: query.page,
      pageSize: query.pageSize,
      ...(query.keyword ? { keyword: query.keyword } : {}),
      ...(query.status.length ? { status: query.status } : {}),
      ...(query.tags.length ? { tag: query.tags } : {}),
    });
    rows.value = data.items;
    total.value = data.total;
    // 累积已知标签供筛选下拉
    const set = new Set(knownTags.value);
    for (const item of data.items) item.tags.forEach((t) => set.add(t));
    knownTags.value = [...set];
  } catch {
    // 错误提示由响应拦截器统一展示
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  query.page = 1;
  void load();
}

async function onPublish(row: AdminJourneyListItem) {
  // 发布前置校验（章节数）；ready 音频校验在编辑页做完整检查
  if (row.chapterCount === 0) {
    ElMessage.warning("该旅程还没有章节，请先编辑添加章节");
    return;
  }
  await ElMessageBox.confirm(`确定发布「${row.title}」吗？发布后用户端立即可见。`, "发布旅程", {
    confirmButtonText: "发布",
    cancelButtonText: "取消",
    type: "warning",
  });
  await updateJourney(row.id, { status: "published" });
  ElMessage.success("已发布");
  await load();
}

async function onOffline(row: AdminJourneyListItem) {
  await ElMessageBox.confirm(`确定下架「${row.title}」吗？下架后用户端不可见。`, "下架旅程", {
    confirmButtonText: "下架",
    cancelButtonText: "取消",
    type: "warning",
  });
  await updateJourney(row.id, { status: "offline" });
  ElMessage.success("已下架");
  await load();
}

/** 删除是不可逆操作：二次确认明确告知级联后果；已发布旅程由后端 409 拦截并提示先下架 */
async function onDelete(row: AdminJourneyListItem) {
  await ElMessageBox.confirm(
    `确定删除「${row.title}」吗？章节、音频资产、管线任务与用户播放记录将被一并删除，且不可恢复。`,
    "删除旅程",
    { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "error" },
  );
  await deleteJourney(row.id);
  ElMessage.success("已删除");
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
  width: 200px;
}
.table {
  width: 100%;
}
.cell-title {
  font-weight: 500;
}
.cell-subtitle {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.tag-item {
  margin-right: 6px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
