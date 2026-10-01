<template>
  <div v-loading="loading" class="dashboard">
    <template v-if="stats">
      <div class="dashboard__header">
        <h2 class="dashboard__title">数据看板</h2>
        <div class="dashboard__meta">
          <span class="dashboard__generated">
            数据生成于 {{ formatTime(stats.generatedAt) }}（缓存 {{ stats.cacheTtlSec / 60 }} 分钟）
          </span>
          <el-button size="small" :loading="refreshing" @click="load(true)">刷新重算</el-button>
        </div>
      </div>

      <!-- 播放概览 -->
      <h3 class="dashboard__section">播放概览</h3>
      <el-row :gutter="16">
        <el-col :span="4"><StatCard label="播放记录" :value="formatInt(stats.playback.totalPlays)" hint="用户×章节粒度" /></el-col>
        <el-col :span="4"><StatCard label="去重听友" :value="formatInt(stats.playback.uniqueListeners)" /></el-col>
        <el-col :span="4"><StatCard label="完播率" :value="formatPct(stats.playback.completionRate)" hint="进度 ≥ 90%" /></el-col>
        <el-col :span="4"><StatCard label="完播记录" :value="formatInt(stats.playback.completedCount)" /></el-col>
        <el-col :span="4"><StatCard label="近 7 天活跃" :value="formatInt(stats.playback.activeLast7d)" /></el-col>
        <el-col :span="4"><StatCard label="近 30 天活跃" :value="formatInt(stats.playback.activeLast30d)" /></el-col>
      </el-row>

      <!-- 订阅转化 -->
      <h3 class="dashboard__section">订阅转化</h3>
      <el-row :gutter="16">
        <el-col :span="4"><StatCard label="注册用户" :value="formatInt(stats.subscription.totalUsers)" /></el-col>
        <el-col :span="4"><StatCard label="付费中用户" :value="formatInt(stats.subscription.payingUsers)" hint="试用 + 有效" /></el-col>
        <el-col :span="4"><StatCard label="付费转化率" :value="formatPct(stats.subscription.conversionRate)" /></el-col>
        <el-col :span="4"><StatCard label="首购事件" :value="formatInt(stats.subscription.initialPurchaseEvents)" /></el-col>
        <el-col :span="4"><StatCard label="续费事件" :value="formatInt(stats.subscription.renewalEvents)" /></el-col>
        <el-col :span="4">
          <el-card shadow="never" class="stat-card stat-card--status">
            <div class="stat-card__label">状态分布</div>
            <div class="stat-card__tags">
              <el-tag
                v-for="(meta, status) in SUBSCRIPTION_STATUS_MAP"
                :key="status"
                :type="meta.type"
                size="small"
                effect="plain"
              >
                {{ meta.label }} {{ stats.subscription.byStatus[status] }}
              </el-tag>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 热门场景 -->
      <h3 class="dashboard__section">热门场景排行</h3>
      <el-card shadow="never">
        <el-table v-if="stats.topJourneys.length > 0" :data="stats.topJourneys">
          <el-table-column label="#" width="56">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="封面" width="72">
            <template #default="{ row }: { row: AdminStatsTopJourney }">
              <el-image
                v-if="row.coverUrl"
                :src="row.coverUrl"
                fit="cover"
                style="width: 48px; height: 32px; border-radius: 4px"
              />
              <span v-else class="dashboard__no-cover">无</span>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="旅程" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="90">
            <template #default="{ row }: { row: AdminStatsTopJourney }">
              <el-tag :type="CONTENT_STATUS_MAP[row.status].type" size="small">
                {{ CONTENT_STATUS_MAP[row.status].label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="免费" width="70">
            <template #default="{ row }: { row: AdminStatsTopJourney }">{{ row.isFree ? "免费" : "付费" }}</template>
          </el-table-column>
          <el-table-column prop="playCount" label="播放" width="90" sortable />
          <el-table-column prop="uniqueListeners" label="听友" width="90" sortable />
          <el-table-column label="完播率" min-width="160">
            <template #default="{ row }: { row: AdminStatsTopJourney }">
              <el-progress
                :percentage="Math.round(row.completionRate * 100)"
                :stroke-width="8"
              />
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无播放数据" :image-size="80" />
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchStatsOverview } from "@/api/stats";
import type { AdminStatsOverview, AdminStatsTopJourney } from "@/types/api";
import { CONTENT_STATUS_MAP, SUBSCRIPTION_STATUS_MAP } from "@/utils/status";
import StatCard from "@/components/StatCard.vue";

const stats = ref<AdminStatsOverview | null>(null);
const loading = ref(false);
const refreshing = ref(false);

async function load(forceRefresh = false) {
  if (forceRefresh) {
    refreshing.value = true;
  } else {
    loading.value = true;
  }
  try {
    stats.value = await fetchStatsOverview(forceRefresh);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function formatInt(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

onMounted(() => load());
</script>

<style scoped>
.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.dashboard__title {
  margin: 0;
  font-size: 20px;
}
.dashboard__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dashboard__generated {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.dashboard__section {
  margin: 24px 0 12px;
  font-size: 15px;
  color: var(--el-text-color-regular);
}
.stat-card__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.stat-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.dashboard__no-cover {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
