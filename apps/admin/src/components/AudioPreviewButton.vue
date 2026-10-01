<template>
  <div>
    <el-button
      v-if="asset.status === 'ready'"
      size="small"
      :loading="loading"
      @click="toggle"
    >
      {{ playing ? "停止" : "试听" }}
    </el-button>
    <el-tag v-else size="small" type="warning" effect="plain">处理中</el-tag>
    <audio
      ref="audioEl"
      :src="playUrl"
      preload="none"
      @ended="playing = false"
      @error="onError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { fetchAudioPlayUrl } from "@/api/chapters";
import type { AdminAudioAsset } from "@/types/api";

const props = defineProps<{ asset: AdminAudioAsset }>();

const audioEl = ref<HTMLAudioElement>();
const playUrl = ref("");
const loading = ref(false);
const playing = ref(false);

/**
 * 试听：播放地址必须由后端签发（HMAC 绑定 objectKey+expires+userId），
 * 禁止把 objectKey 直接拼成 URL。
 */
async function toggle() {
  if (playing.value) {
    audioEl.value?.pause();
    playing.value = false;
    return;
  }
  loading.value = true;
  try {
    const data = await fetchAudioPlayUrl(props.asset.id);
    playUrl.value = data.url;
    // 等 DOM 更新后再播放
    requestAnimationFrame(() => {
      audioEl.value?.play().catch(() => ElMessage.warning("浏览器拦截了自动播放，请再点一次"));
    });
    playing.value = true;
  } catch {
    // 错误提示由拦截器统一展示
  } finally {
    loading.value = false;
  }
}

function onError() {
  playing.value = false;
  ElMessage.error("音频加载失败，请稍后重试");
}
</script>
