<template>
  <div>
    <el-tabs v-model="tab">
      <!-- 审核队列：集中展示待确认草稿，减少跳转 -->
      <el-tab-pane label="待确认草稿" name="review">
        <div class="tab-toolbar">
          <span class="hint">服务端聚合（GET /admin/chapters?draftStatus=pending）</span>
          <el-button size="small" :icon="Refresh" @click="loadPending">刷新</el-button>
        </div>
        <el-table v-loading="pendingLoading" :data="pendingChapters">
          <el-table-column label="旅程" min-width="140">
            <template #default="{ row }">{{ row.journeyTitle }}</template>
          </el-table-column>
          <el-table-column prop="title" label="章节" min-width="140" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }: { row: AdminChapterListItem }">
              <el-tag :type="DRAFT_STATUS_MAP[row.draftStatus].type" size="small" effect="dark">
                {{ DRAFT_STATUS_MAP[row.draftStatus].label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="文案预览" min-width="220">
            <template #default="{ row }">
              <span class="narration-preview">{{ row.narrationPreview || "（空）" }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/pipeline/chapters/${row.id}`)">
                打开管线
              </el-button>
              <el-button link type="success" @click="onQuickConfirm(row)">确认</el-button>
              <el-button link type="danger" @click="onQuickReject(row)">驳回</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="没有待确认的草稿" />
          </template>
        </el-table>
        <el-pagination
          v-model:current-page="pendingQuery.page"
          v-model:page-size="pendingQuery.pageSize"
          :total="pendingTotal"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          class="pager"
          @change="loadPending"
        />
      </el-tab-pane>

      <!-- 队列概览 + 死信 -->
      <el-tab-pane label="队列与死信" name="queue">
        <div class="tab-toolbar">
          <el-button size="small" :icon="Refresh" @click="loadQueue">刷新</el-button>
        </div>
        <div v-loading="queueLoading" class="queue-stats">
          <el-card v-for="item in statCards" :key="item.key" class="stat-card">
            <div class="stat-card__value">{{ item.value }}</div>
            <div class="stat-card__label">{{ item.label }}</div>
          </el-card>
        </div>

        <el-card class="section">
          <template #header>最近任务（进行中 / 排队 / 延迟）</template>
          <el-table :data="recentJobs">
            <el-table-column label="步骤" width="110">
              <template #default="{ row }">{{ stepLabel(row.name) }}</template>
            </el-table-column>
            <el-table-column label="章节 ID" min-width="220">
              <template #default="{ row }">
                <span class="mono">{{ chapterIdOf(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="重试次数" width="90" align="center">
              <template #default="{ row }">{{ row.attemptsMade ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="失败原因" min-width="180">
              <template #default="{ row }">{{ row.failedReason || "—" }}</template>
            </el-table-column>
            <template #empty><el-empty description="暂无任务" :image-size="60" /></template>
          </el-table>
        </el-card>

        <el-card class="section">
          <template #header>死信队列（重试耗尽，可手动重跑）</template>
          <el-table :data="deadLetters">
            <el-table-column label="步骤" width="110">
              <template #default="{ row }">{{ stepLabel(row.name) }}</template>
            </el-table-column>
            <el-table-column label="章节 ID" min-width="220">
              <template #default="{ row }">
                <span class="mono">{{ chapterIdOf(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="重试次数" width="90" align="center">
              <template #default="{ row }">{{ row.attemptsMade ?? 0 }}</template>
            </el-table-column>
            <el-table-column label="失败原因" min-width="200">
              <template #default="{ row }">{{ row.failedReason || "—" }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button
                  size="small"
                  type="warning"
                  :disabled="!canRerun(row)"
                  :loading="rerunning === row.id"
                  @click="onRerunDead(row)"
                >
                  重跑
                </el-button>
              </template>
            </el-table-column>
            <template #empty><el-empty description="死信队列为空" :image-size="60" /></template>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { PIPELINE_STEPS } from "@shenyou/shared";
import type { PipelineStep } from "@shenyou/shared";
import { fetchChapters } from "@/api/chapters";
import { confirmDraft, fetchDeadLetters, fetchQueueStats, rejectDraft, rerunStep } from "@/api/pipeline";
import { DRAFT_STATUS_MAP, PIPELINE_STEP_MAP } from "@/utils/status";
import type { AdminChapterListItem, DeadLetterItem, QueueStatsData } from "@/types/api";

const router = useRouter();
const tab = ref("review");

// —— 待确认草稿 ——
const pendingLoading = ref(false);
const pendingChapters = ref<AdminChapterListItem[]>([]);
const pendingTotal = ref(0);
const pendingQuery = reactive({ page: 1, pageSize: 20 });

async function loadPending() {
  pendingLoading.value = true;
  try {
    const data = await fetchChapters({
      page: pendingQuery.page,
      pageSize: pendingQuery.pageSize,
      draftStatus: ["pending"],
    });
    pendingChapters.value = data.items;
    pendingTotal.value = data.total;
  } finally {
    pendingLoading.value = false;
  }
}

async function onQuickConfirm(row: AdminChapterListItem) {
  await ElMessageBox.confirm("确认草稿后将进入 TTS 合成，会消耗合成额度。确认无误吗？", "确认草稿", {
    confirmButtonText: "确认合成",
    cancelButtonText: "再看看",
    type: "warning",
  });
  await confirmDraft(row.id);
  ElMessage.success("已确认，管线开始合成");
  await loadPending();
}

async function onQuickReject(row: AdminChapterListItem) {
  await ElMessageBox.confirm("确定驳回该草稿吗？", "驳回草稿", {
    confirmButtonText: "驳回",
    cancelButtonText: "取消",
    type: "warning",
  });
  await rejectDraft(row.id);
  ElMessage.success("已驳回");
  await loadPending();
}

// —— 队列与死信 ——
const queueLoading = ref(false);
const stats = ref<QueueStatsData | null>(null);
const deadLetters = ref<DeadLetterItem[]>([]);
const rerunning = ref<string | undefined>("");

const statCards = computed(() => [
  { key: "active", label: "运行中", value: stats.value?.counts.active ?? 0 },
  { key: "waiting", label: "排队中", value: stats.value?.counts.waiting ?? 0 },
  { key: "delayed", label: "延迟", value: stats.value?.counts.delayed ?? 0 },
  { key: "completed", label: "已完成", value: stats.value?.counts.completed ?? 0 },
  { key: "failed", label: "失败", value: stats.value?.counts.failed ?? 0 },
]);

const recentJobs = computed(() => stats.value?.recent ?? []);

function stepLabel(name: string | undefined): string {
  return name && (PIPELINE_STEPS as readonly string[]).includes(name)
    ? PIPELINE_STEP_MAP[name as PipelineStep]
    : (name ?? "—");
}

function chapterIdOf(row: { data?: Record<string, unknown> }): string {
  const id = row.data?.chapterId;
  return typeof id === "string" ? id : "—";
}

function canRerun(row: DeadLetterItem): boolean {
  return (
    typeof row.data?.chapterId === "string" &&
    !!row.name &&
    (PIPELINE_STEPS as readonly string[]).includes(row.name)
  );
}

async function loadQueue() {
  queueLoading.value = true;
  try {
    const [s, d] = await Promise.all([fetchQueueStats(), fetchDeadLetters()]);
    stats.value = s;
    deadLetters.value = d;
  } finally {
    queueLoading.value = false;
  }
}

async function onRerunDead(row: DeadLetterItem) {
  if (!canRerun(row)) return;
  const chapterId = row.data!.chapterId as string;
  const step = row.name as PipelineStep;
  rerunning.value = row.id;
  try {
    await rerunStep(chapterId, step);
    ElMessage.success("已重新投递该任务");
    await loadQueue();
  } finally {
    rerunning.value = "";
  }
}

onMounted(() => {
  void loadPending();
  void loadQueue();
});
</script>

<style scoped>
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.narration-preview {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.queue-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.stat-card {
  flex: 1;
  min-width: 140px;
  text-align: center;
}
.stat-card__value {
  font-size: 28px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat-card__label {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.section {
  margin-top: 16px;
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
