<template>
  <el-card shadow="never" class="stat-card">
    <div class="stat-card__label">{{ label }}</div>
    <div class="stat-card__value">{{ value }}</div>
    <div v-if="hint" class="stat-card__hint">{{ hint }}</div>
  </el-card>
</template>

<script setup lang="ts">
/** 数据看板统计卡片：指标名 + 数值 + 可选口径说明 */
defineProps<{
  label: string;
  value: string;
  hint?: string;
}>();
</script>

<style scoped>
.stat-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.stat-card__value {
  margin-top: 6px;
  font-size: 24px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat-card__hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  opacity: 0.7;
}
</style>
