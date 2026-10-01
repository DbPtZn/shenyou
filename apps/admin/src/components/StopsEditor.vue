<template>
  <div class="stops-editor">
    <div class="stops-editor__head">
      <span class="stops-editor__label">站点时间轴</span>
      <el-button size="small" :icon="Plus" @click="addStop">添加站点</el-button>
    </div>
    <el-empty v-if="!modelValue.length" description="暂无站点，点击右上角添加" :image-size="60" />
    <div v-for="(stop, i) in modelValue" :key="i" class="stop-row">
      <el-input-number
        :model-value="stop.timeSec"
        :min="0"
        :step="10"
        controls-position="right"
        class="stop-row__time"
        @update:model-value="(v: number | undefined) => update(i, { timeSec: v ?? 0 })"
      />
      <span class="stop-row__mmss">{{ formatDuration(stop.timeSec) }}</span>
      <el-input
        :model-value="stop.title"
        placeholder="站点标题"
        class="stop-row__title"
        @update:model-value="(v: string) => update(i, { title: v })"
      />
      <el-input
        :model-value="stop.subtitle"
        placeholder="副标题（可选）"
        class="stop-row__subtitle"
        @update:model-value="(v: string) => update(i, { subtitle: v })"
      />
      <el-button :icon="Delete" circle plain type="danger" @click="remove(i)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Delete, Plus } from "@element-plus/icons-vue";
import type { ChapterStop } from "@shenyou/shared";
import { formatDuration } from "@/utils/format";

const props = defineProps<{ modelValue: ChapterStop[] }>();
const emit = defineEmits<{ "update:modelValue": [value: ChapterStop[]] }>();

function update(index: number, patch: Partial<ChapterStop>) {
  const next = props.modelValue.map((s, i) => (i === index ? { ...s, ...patch } : s));
  emit("update:modelValue", next);
}

function addStop() {
  const last = props.modelValue[props.modelValue.length - 1];
  const timeSec = last ? last.timeSec + 60 : 0;
  emit("update:modelValue", [...props.modelValue, { timeSec, title: "" }]);
}

function remove(index: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => i !== index),
  );
}
</script>

<style scoped>
.stops-editor__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.stops-editor__label {
  font-weight: 500;
}
.stop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.stop-row__time {
  width: 110px;
}
.stop-row__mmss {
  width: 52px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.stop-row__title {
  width: 220px;
}
.stop-row__subtitle {
  flex: 1;
}
</style>
