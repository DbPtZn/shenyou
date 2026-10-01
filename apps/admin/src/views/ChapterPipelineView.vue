<template>
  <div v-loading="loading">
    <template v-if="chapter">
      <el-page-header :content="`章节管线 · ${chapter.title}`" @back="router.back()" />

      <!-- 文案与草稿审核 -->
      <el-card class="section">
        <template #header>
          <div class="section__header">
            <span>旁白文案</span>
            <div class="section__actions">
              <el-tag :type="DRAFT_STATUS_MAP[chapter.draftStatus].type" effect="dark">
                {{ DRAFT_STATUS_MAP[chapter.draftStatus].label }}
              </el-tag>
              <el-button
                size="small"
                type="primary"
                :loading="acting === 'draft'"
                @click="onTriggerDraft"
              >
                生成草稿
              </el-button>
              <el-button
                size="small"
                type="success"
                :disabled="chapter.draftStatus !== 'pending' || !chapter.narrationText"
                :loading="acting === 'confirm'"
                @click="onConfirm"
              >
                确认草稿
              </el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="chapter.draftStatus !== 'pending'"
                :loading="acting === 'reject'"
                @click="onReject"
              >
                驳回
              </el-button>
            </div>
          </div>
        </template>
        <div class="meta">
          <span>音色：{{ chapter.voiceId || "未设置" }}</span>
          <span>BGM 标签：{{ chapter.musicTags.join("、") || "未设置" }}</span>
          <span v-if="chapter.draftHash">草稿 Hash：{{ chapter.draftHash.slice(0, 12) }}…</span>
        </div>
        <el-input
          v-if="chapter.narrationText"
          :model-value="chapter.narrationText"
          type="textarea"
          :rows="10"
          readonly
          class="narration"
        />
        <el-empty v-else description="还没有文案，点击「生成草稿」让 AI 写一版" :image-size="60" />
      </el-card>

      <!-- 管线步骤进度 -->
      <el-card class="section">
        <template #header>
          <div class="section__header">
            <span>管线步骤</span>
            <el-button size="small" :icon="Refresh" @click="loadStatus">刷新</el-button>
          </div>
        </template>
        <div class="steps">
          <div v-for="step in PIPELINE_STEPS" :key="step" class="step">
            <div class="step__head">
              <span class="step__name">{{ PIPELINE_STEP_MAP[step] }}</span>
              <el-tag
                v-if="latestJob(step)"
                :type="PIPELINE_JOB_STATUS_MAP[latestJob(step)!.status].type"
                size="small"
                effect="dark"
              >
                {{ PIPELINE_JOB_STATUS_MAP[latestJob(step)!.status].label }}
              </el-tag>
              <el-tag v-else size="small" type="info" effect="plain">未触发</el-tag>
            </div>
            <template v-if="latestJob(step)">
              <div v-if="latestJob(step)!.errorMessage" class="step__error">
                {{ latestJob(step)!.errorMessage }}
              </div>
              <div class="step__hash">hash: {{ latestJob(step)!.contentHash.slice(0, 12) }}…</div>
              <el-button
                v-if="latestJob(step)!.status === 'failed' || latestJob(step)!.status === 'dead'"
                size="small"
                type="warning"
                :loading="acting === `rerun-${step}`"
                @click="onRerun(step)"
              >
                重跑此步
              </el-button>
            </template>
          </div>
        </div>
      </el-card>

      <!-- 音频资产 -->
      <el-card class="section">
        <template #header>
          <div class="section__header">
            <span>音频资产</span>
            <AudioUpload :chapter-id="chapter.id" @uploaded="loadAll" />
          </div>
        </template>
        <el-empty v-if="!chapter.audioAssets.length" description="暂无音频资产" :image-size="60" />
        <el-table v-else :data="chapter.audioAssets">
          <el-table-column label="轨道" width="100">
            <template #default="{ row }: { row: AdminAudioAsset }">{{ AUDIO_TRACK_TYPE_MAP[row.trackType] }}</template>
          </el-table-column>
          <el-table-column prop="mixPreset" label="混音预置" width="100" />
          <el-table-column label="时长" width="90" align="center">
            <template #default="{ row }: { row: AdminAudioAsset }">{{ formatDuration(row.durationSec) }}</template>
          </el-table-column>
          <el-table-column label="大小" width="100" align="center">
            <template #default="{ row }: { row: AdminAudioAsset }">{{ formatBytes(row.sizeBytes) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }: { row: AdminAudioAsset }">
              <el-tag
                :type="AUDIO_ASSET_STATUS_MAP[row.status].type"
                size="small"
                effect="dark"
              >
                {{ AUDIO_ASSET_STATUS_MAP[row.status].label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="试听" width="110">
            <template #default="{ row }: { row: AdminAudioAsset }">
              <AudioPreviewButton :asset="row" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { PIPELINE_STEPS } from "@shenyou/shared";
import type { PipelineStep } from "@shenyou/shared";
import { fetchChapterDetail } from "@/api/chapters";
import {
  confirmDraft,
  fetchPipelineStatus,
  rejectDraft,
  rerunStep,
  triggerDraft,
} from "@/api/pipeline";
import AudioPreviewButton from "@/components/AudioPreviewButton.vue";
import AudioUpload from "@/components/AudioUpload.vue";
import {
  AUDIO_ASSET_STATUS_MAP,
  AUDIO_TRACK_TYPE_MAP,
  DRAFT_STATUS_MAP,
  PIPELINE_JOB_STATUS_MAP,
  PIPELINE_STEP_MAP,
} from "@/utils/status";
import { formatBytes, formatDuration } from "@/utils/format";
import type { AdminAudioAsset, AdminChapterDetail, AdminPipelineJob } from "@/types/api";

const route = useRoute();
const router = useRouter();
const chapterId = typeof route.params.id === "string" ? route.params.id : "";

const loading = ref(false);
const chapter = ref<AdminChapterDetail | null>(null);
const jobs = ref<AdminPipelineJob[]>([]);
const acting = ref("");

/** 运行中轮询（4s），页面卸载即停 */
let pollTimer: ReturnType<typeof setInterval> | null = null;

function latestJob(step: PipelineStep): AdminPipelineJob | undefined {
  const list = jobs.value.filter((j) => j.step === step);
  return list[list.length - 1];
}

function hasActiveJob(): boolean {
  return jobs.value.some((j) => j.status === "pending" || j.status === "running");
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    void loadStatus().then(() => {
      if (!hasActiveJob()) stopPolling();
    });
  }, 4000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function loadChapter() {
  chapter.value = await fetchChapterDetail(chapterId);
  jobs.value = chapter.value.pipelineJobs;
}

async function loadStatus() {
  const data = await fetchPipelineStatus(chapterId);
  jobs.value = data.jobs;
  if (chapter.value) {
    chapter.value = {
      ...chapter.value,
      narrationText: data.chapter.narrationText,
      draftStatus: data.chapter.draftStatus as AdminChapterDetail["draftStatus"],
      draftHash: data.chapter.draftHash,
      voiceId: data.chapter.voiceId,
      musicTags: data.chapter.musicTags,
    };
  }
}

async function loadAll() {
  loading.value = true;
  try {
    await loadChapter();
  } finally {
    loading.value = false;
  }
  if (hasActiveJob()) startPolling();
}

async function onTriggerDraft() {
  acting.value = "draft";
  try {
    await triggerDraft(chapterId);
    ElMessage.success("草稿任务已投递");
    await loadStatus();
    startPolling();
  } finally {
    acting.value = "";
  }
}

async function onConfirm() {
  await ElMessageBox.confirm("确认草稿后将进入 TTS 合成，会消耗合成额度。确认无误吗？", "确认草稿", {
    confirmButtonText: "确认合成",
    cancelButtonText: "再看看",
    type: "warning",
  });
  acting.value = "confirm";
  try {
    await confirmDraft(chapterId);
    ElMessage.success("已确认，管线开始合成");
    await loadStatus();
    startPolling();
  } finally {
    acting.value = "";
  }
}

async function onReject() {
  await ElMessageBox.confirm("驳回后需要重新生成草稿。确定驳回吗？", "驳回草稿", {
    confirmButtonText: "驳回",
    cancelButtonText: "取消",
    type: "warning",
  });
  acting.value = "reject";
  try {
    await rejectDraft(chapterId);
    ElMessage.success("已驳回");
    await loadAll();
  } finally {
    acting.value = "";
  }
}

async function onRerun(step: PipelineStep) {
  acting.value = `rerun-${step}`;
  try {
    await rerunStep(chapterId, step);
    ElMessage.success(`「${PIPELINE_STEP_MAP[step]}」已重新投递`);
    await loadStatus();
    startPolling();
  } finally {
    acting.value = "";
  }
}

onMounted(loadAll);
onBeforeUnmount(stopPolling);
</script>

<style scoped>
.section {
  margin-top: 16px;
}
.section__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.meta {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.narration {
  font-size: 13px;
  line-height: 1.9;
}
.steps {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.step {
  flex: 1;
  min-width: 160px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
}
.step__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.step__name {
  font-weight: 500;
}
.step__error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-bottom: 8px;
  word-break: break-all;
}
.step__hash {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}
</style>
