<template>
  <div v-loading="loading">
    <el-page-header :content="isNew ? '新建旅程' : '编辑旅程'" @back="router.push('/journeys')" />

    <el-card class="section">
      <template #header>基础信息</template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="80" show-word-limit placeholder="如：雨夜京都小巷" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="form.subtitle" maxlength="120" placeholder="一句话氛围描述（可选）" />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入后回车创建标签，最多 10 个"
            class="form__tags"
          />
        </el-form-item>
        <el-form-item label="封面">
          <el-upload
            :show-file-list="false"
            accept="image/jpeg,image/png,image/webp"
            :http-request="onCoverUpload"
          >
            <img v-if="form.coverUrl" :src="form.coverUrl" class="cover-preview" alt="封面预览" />
            <div v-else class="cover-placeholder">
              <el-icon :size="20"><Plus /></el-icon>
              <span>点击上传封面</span>
            </div>
          </el-upload>
          <el-button
            v-if="form.coverUrl"
            link
            type="danger"
            class="cover-remove"
            @click="form.coverUrl = ''"
          >
            移除封面
          </el-button>
          <div class="form__hint cover-hint">支持 JPG / PNG / WebP，建议比例 3:4 或 16:9</div>
        </el-form-item>
        <el-form-item label="是否免费">
          <el-switch v-model="form.isFree" active-text="免费" inactive-text="会员专属" />
        </el-form-item>
        <el-form-item v-if="!isNew && detail" label="状态">
          <el-tag :type="CONTENT_STATUS_MAP[detail.status].type" effect="dark">
            {{ CONTENT_STATUS_MAP[detail.status].label }}
          </el-tag>
          <span class="form__hint">总时长 {{ formatDuration(detail.totalDurationSec) }}</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="onSave">
            {{ isNew ? "创建旅程" : "保存修改" }}
          </el-button>
          <template v-if="!isNew && detail">
            <el-button
              v-if="detail.status !== 'published'"
              type="success"
              :loading="publishing"
              @click="onPublish"
            >
              发布
            </el-button>
            <el-button v-else type="warning" @click="onOffline">下架</el-button>
          </template>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="!isNew && detail" class="section">
      <template #header>
        <div class="section__header">
          <span>章节管理（{{ detail.chapters.length }}）</span>
          <el-button size="small" type="primary" :icon="Plus" @click="onAddChapterClick">
            添加章节
          </el-button>
        </div>
      </template>
      <el-empty v-if="!detail.chapters.length" description="暂无章节" :image-size="60" />
      <el-table
        v-else
        ref="chaptersTableRef"
        :data="detail.chapters"
        row-key="id"
        class="chapters-table"
      >
        <el-table-column width="46" align="center">
          <template #default>
            <el-icon class="chapter-drag-handle" title="拖拽调整顺序"><Rank /></el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="index" label="#" width="60" align="center" />
        <el-table-column prop="title" label="标题" min-width="160" />
        <el-table-column label="站点数" width="80" align="center">
          <template #default="{ row }: { row: AdminJourneyChapter }">{{ row.stops.length }}</template>
        </el-table-column>
        <el-table-column label="时长" width="90" align="center">
          <template #default="{ row }: { row: AdminJourneyChapter }">{{ formatDuration(row.durationSec) }}</template>
        </el-table-column>
        <el-table-column label="文案状态" width="100">
          <template #default="{ row }: { row: AdminJourneyChapter }">
            <el-tag :type="DRAFT_STATUS_MAP[row.draftStatus].type" size="small" effect="plain">
              {{ DRAFT_STATUS_MAP[row.draftStatus].label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="音频" width="100" align="center">
          <template #default="{ row }: { row: AdminJourneyChapter }">
            <el-tag
              :type="row.audioAssets.some((a) => a.trackType === 'mixed' && a.status === 'ready') ? 'success' : 'info'"
              size="small"
              effect="plain"
            >
              {{ row.audioAssets.some((a) => a.trackType === 'mixed' && a.status === 'ready') ? "已就绪" : "未就绪" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }: { row: AdminJourneyChapter }">
            <el-button link type="primary" @click="router.push(`/pipeline/chapters/${row.id}`)">
              管线 / 音频
            </el-button>
            <el-button link @click="onEditChapter(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 章节对话框（添加 / 编辑共用，含站点时间轴编辑器） -->
    <el-dialog
      v-model="chapterDialogVisible"
      :title="editingChapterId ? '编辑章节' : '添加章节'"
      width="720px"
      destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item v-if="editingChapterId" label="序号">
          <el-input-number v-model="chapterForm.index" :min="1" :precision="0" />
          <span class="form__hint">修改序号可调整章节顺序，与既有章节冲突会被拒绝</span>
        </el-form-item>
        <el-form-item label="章节标题" required>
          <el-input v-model="chapterForm.title" maxlength="80" placeholder="如：第一章 · 巷口" />
        </el-form-item>
        <el-form-item label="副标题">
          <el-input v-model="chapterForm.subtitle" maxlength="120" placeholder="可选" />
        </el-form-item>
        <el-form-item label="站点时间轴">
          <StopsEditor v-model="chapterForm.stops" class="chapter-form__stops" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="chapterDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="chapterSaving" @click="onSubmitChapter">
          {{ editingChapterId ? "保存" : "创建" }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import type { UploadRequestOptions } from "element-plus";
import { Plus, Rank } from "@element-plus/icons-vue";
import type { FormInstance, FormRules } from "element-plus";
import type { ChapterStop } from "@shenyou/shared";
import Sortable from "sortablejs";
import {
  createCoverUpload,
  createJourney,
  fetchJourneyDetail,
  reorderChapters,
  updateJourney,
} from "@/api/journeys";
import { createChapter, updateChapter } from "@/api/chapters";
import StopsEditor from "@/components/StopsEditor.vue";
import { CONTENT_STATUS_MAP, DRAFT_STATUS_MAP } from "@/utils/status";
import { formatDuration } from "@/utils/format";
import type { AdminJourneyChapter, AdminJourneyDetail } from "@/types/api";

const route = useRoute();
const router = useRouter();
const journeyId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));
const isNew = computed(() => !journeyId.value);

const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const detail = ref<AdminJourneyDetail | null>(null);

const formRef = ref<FormInstance>();
const form = reactive({
  title: "",
  subtitle: "",
  coverUrl: "",
  tags: [] as string[],
  isFree: false,
});
const rules: FormRules = {
  title: [{ required: true, message: "请输入旅程标题", trigger: "blur" }],
};

const chapterDialogVisible = ref(false);
const chapterSaving = ref(false);
/** null = 添加模式；否则为编辑中的章节 id */
const editingChapterId = ref<string | null>(null);
const chapterForm = reactive({
  title: "",
  subtitle: "",
  index: 1,
  stops: [] as ChapterStop[],
});

// el-table 实例（用于定位 tbody 挂载 Sortable）
const chaptersTableRef = ref<{ $el: HTMLElement } | null>(null);
let sortable: Sortable | null = null;
// 当前 Sortable 实例挂载的 tbody（el-table 重渲染可能替换节点，需据此判断）
let boundTbody: HTMLElement | null = null;

async function load() {
  if (isNew.value) return;
  loading.value = true;
  try {
    detail.value = await fetchJourneyDetail(journeyId.value);
    form.title = detail.value.title;
    form.subtitle = detail.value.subtitle ?? "";
    form.coverUrl = detail.value.coverUrl ?? "";
    form.tags = [...detail.value.tags];
    form.isFree = detail.value.isFree;
    if (detail.value.chapters.length > 0) {
      void initSortable();
    }
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  saving.value = true;
  try {
    const payload = {
      title: form.title.trim(),
      ...(form.subtitle.trim() ? { subtitle: form.subtitle.trim() } : {}),
      // coverUrl 始终提交：空串表示移除封面（服务端按 undefined 判定是否更新）
      coverUrl: form.coverUrl.trim(),
      tags: form.tags,
      isFree: form.isFree,
    };
    if (isNew.value) {
      const created = await createJourney(payload);
      ElMessage.success("旅程已创建，现在添加章节吧");
      await router.replace(`/journeys/${created.id}`);
    } else {
      await updateJourney(journeyId.value, payload);
      ElMessage.success("已保存");
      await load();
    }
  } finally {
    saving.value = false;
  }
}

/** 发布前置校验：无章节 / 无 ready 混音音频时不允许发布 */
async function onPublish() {
  const d = detail.value;
  if (!d) return;
  if (d.chapters.length === 0) {
    ElMessage.warning("该旅程还没有章节，请先添加章节");
    return;
  }
  const notReady = d.chapters.filter(
    (c) => !c.audioAssets.some((a) => a.trackType === "mixed" && a.status === "ready"),
  );
  if (notReady.length > 0) {
    ElMessage.warning(
      `以下章节还没有就绪的混音音频：${notReady.map((c) => c.title).join("、")}。请先完成音频制作。`,
    );
    return;
  }
  await ElMessageBox.confirm(`确定发布「${d.title}」吗？发布后用户端立即可见。`, "发布旅程", {
    confirmButtonText: "发布",
    cancelButtonText: "取消",
    type: "warning",
  });
  publishing.value = true;
  try {
    await updateJourney(journeyId.value, { status: "published" });
    ElMessage.success("已发布");
    await load();
  } finally {
    publishing.value = false;
  }
}

async function onOffline() {
  const d = detail.value;
  if (!d) return;
  await ElMessageBox.confirm(`确定下架「${d.title}」吗？下架后用户端不可见。`, "下架旅程", {
    confirmButtonText: "下架",
    cancelButtonText: "取消",
    type: "warning",
  });
  await updateJourney(journeyId.value, { status: "offline" });
  ElMessage.success("已下架");
  await load();
}

function resetChapterForm() {
  editingChapterId.value = null;
  chapterForm.title = "";
  chapterForm.subtitle = "";
  chapterForm.index = (detail.value?.chapters.length ?? 0) + 1;
  chapterForm.stops = [];
}

function onAddChapterClick() {
  resetChapterForm();
  chapterDialogVisible.value = true;
}

/** 编辑模式：预填表单（stops 深拷贝，避免直接改到详情数据） */
function onEditChapter(row: AdminJourneyChapter) {
  editingChapterId.value = row.id;
  chapterForm.title = row.title;
  chapterForm.subtitle = row.subtitle ?? "";
  chapterForm.index = row.index;
  chapterForm.stops = row.stops.map((s) => ({ ...s }));
  chapterDialogVisible.value = true;
}

async function onSubmitChapter() {
  if (!chapterForm.title.trim()) {
    ElMessage.warning("请输入章节标题");
    return;
  }
  const invalidStop = chapterForm.stops.find((s) => !s.title.trim());
  if (invalidStop) {
    ElMessage.warning("存在未填写标题的站点");
    return;
  }
  const stops = chapterForm.stops
    .filter((s) => s.title.trim())
    .map((s) => ({
      timeSec: s.timeSec,
      title: s.title.trim(),
      ...(s.subtitle?.trim() ? { subtitle: s.subtitle.trim() } : {}),
    }));
  chapterSaving.value = true;
  try {
    if (editingChapterId.value) {
      await updateChapter(editingChapterId.value, {
        title: chapterForm.title.trim(),
        ...(chapterForm.subtitle.trim() ? { subtitle: chapterForm.subtitle.trim() } : {}),
        index: chapterForm.index,
        stops,
      });
      ElMessage.success("章节已保存");
    } else {
      await createChapter(journeyId.value, {
        title: chapterForm.title.trim(),
        ...(chapterForm.subtitle.trim() ? { subtitle: chapterForm.subtitle.trim() } : {}),
        stops,
      });
      ElMessage.success("章节已创建");
    }
    chapterDialogVisible.value = false;
    resetChapterForm();
    await load();
  } finally {
    chapterSaving.value = false;
  }
}

// —— 章节拖拽排序 ——

async function initSortable() {
  await nextTick();
  const root = chaptersTableRef.value?.$el;
  const tbody = root?.querySelector<HTMLElement>(".el-table__body-wrapper tbody");
  if (!tbody) return;
  // 同一 tbody 且实例仍存活：无需重复挂载
  if (boundTbody === tbody && sortable) return;
  // tbody 被 el-table 重渲染替换（或上一实例已销毁）：先销毁旧实例再挂载
  sortable?.destroy();
  boundTbody = tbody;
  sortable = Sortable.create(tbody, {
    animation: 150,
    handle: ".chapter-drag-handle",
    onEnd: onChapterDragEnd,
  });
}

function onChapterDragEnd(evt: Sortable.SortableEvent) {
  const chapters = detail.value?.chapters;
  if (
    !chapters ||
    evt.oldIndex === undefined ||
    evt.newIndex === undefined ||
    evt.oldIndex === evt.newIndex
  ) {
    return;
  }
  const [moved] = chapters.splice(evt.oldIndex, 1);
  if (!moved) return;
  chapters.splice(evt.newIndex, 0, moved);
  void persistChapterOrder();
}

/** 拖拽落库：成功后重排本地序号列；失败回滚为服务端状态 */
async function persistChapterOrder() {
  const d = detail.value;
  if (!d) return;
  try {
    const orderedIds = d.chapters.map((c) => c.id);
    await reorderChapters(journeyId.value, orderedIds);
    d.chapters.forEach((c, i) => {
      c.index = i + 1;
    });
    ElMessage.success("章节顺序已保存");
  } catch {
    await load();
  }
}

// —— 封面图预签名直传 ——

async function onCoverUpload(options: UploadRequestOptions) {
  const file = options.file as File;
  let presign;
  try {
    presign = await createCoverUpload(file.name);
  } catch {
    // 签发失败的错误提示已由响应拦截器展示
    throw options.file;
  }
  const resp = await fetch(presign.uploadUrl, { method: "PUT", body: file });
  if (!resp.ok) {
    ElMessage.error(`封面上传失败（HTTP ${resp.status}）`);
    throw options.file;
  }
  form.coverUrl = presign.coverUrl;
  ElMessage.success("封面已上传，记得保存旅程");
}

onMounted(load);
// 组件复用场景（新建后 router.replace 到 /journeys/:id、或手动改 URL）需重新加载
watch(journeyId, (id) => {
  if (id) void load();
});

onBeforeUnmount(() => {
  sortable?.destroy();
  sortable = null;
  boundTbody = null;
});
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
.form__tags {
  width: 100%;
}
.form__hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.chapter-form__stops {
  width: 100%;
}
.cover-preview {
  width: 160px;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--el-border-color);
}
.cover-placeholder {
  width: 160px;
  height: 120px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
}
.cover-placeholder:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.cover-remove {
  margin-left: 12px;
}
.cover-hint {
  margin-left: 0;
  margin-top: 4px;
}
.chapter-drag-handle {
  cursor: move;
  color: var(--el-text-color-secondary);
}
.chapter-drag-handle:hover {
  color: var(--el-color-primary);
}
</style>
