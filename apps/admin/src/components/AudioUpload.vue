<template>
  <div class="audio-upload">
    <el-select v-model="trackType" size="small" class="audio-upload__field" placeholder="轨道类型">
      <el-option
        v-for="t in AUDIO_TRACK_TYPES"
        :key="t"
        :label="AUDIO_TRACK_TYPE_MAP[t]"
        :value="t"
      />
    </el-select>
    <el-select v-model="mixPreset" size="small" class="audio-upload__field" placeholder="混音预置">
      <el-option v-for="p in MIX_PRESETS" :key="p" :label="p" :value="p" />
    </el-select>
    <el-button size="small" :loading="uploading" @click="fileInput?.click()">
      {{ uploading ? `上传中 ${progress}%` : "选择音频文件上传" }}
    </el-button>
    <input
      ref="fileInput"
      type="file"
      accept="audio/*,.m4a,.aac,.mp3,.wav"
      class="audio-upload__input"
      @change="onFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import axios from "axios";
import { ElMessage } from "element-plus";
import { AUDIO_TRACK_TYPES, MIX_PRESETS } from "@shenyou/shared";
import type { AudioTrackType, MixPreset } from "@shenyou/shared";
import { createAudioAsset, markAudioReady } from "@/api/chapters";
import { AUDIO_TRACK_TYPE_MAP } from "@/utils/status";

const props = defineProps<{ chapterId: string }>();
const emit = defineEmits<{ uploaded: [] }>();

const fileInput = ref<HTMLInputElement>();
const trackType = ref<AudioTrackType>("mixed");
const mixPreset = ref<MixPreset>("default");
const uploading = ref(false);
const progress = ref(0);

/**
 * 预签名直传三段式：
 * 1. 创建资产拿到 uploadUrl（S3 预签名 PUT，不含凭证，用裸 axios 直传）
 * 2. 浏览器 PUT 文件到对象存储
 * 3. 回调 ready 标记（时长用 HTMLAudioElement 探测，探测失败回退为人工输入）
 */
async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  input.value = "";

  uploading.value = true;
  progress.value = 0;
  try {
    const { assetId, uploadUrl } = await createAudioAsset(props.chapterId, {
      trackType: trackType.value,
      mixPreset: mixPreset.value,
      fileName: file.name,
    });

    // 直传对象存储（预签名 URL，不带 Authorization）
    await axios.put(uploadUrl, file, {
      headers: { "Content-Type": file.type || "application/octet-stream" },
      onUploadProgress: (e) => {
        if (e.total) progress.value = Math.round((e.loaded / e.total) * 100);
      },
    });

    const durationSec = await probeDuration(file);
    await markAudioReady(assetId, { durationSec, sizeBytes: file.size });
    ElMessage.success("上传完成，音频已就绪");
    emit("uploaded");
  } catch {
    ElMessage.error("上传失败，请重试");
  } finally {
    uploading.value = false;
    progress.value = 0;
  }
}

/** 用浏览器解码探测音频时长（秒）；失败时提示人工确认 */
async function probeDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => reject(new Error("metadata unavailable"));
      audio.src = url;
    });
    return Math.max(1, Math.round(duration));
  } catch {
    const input = window.prompt("无法自动探测音频时长，请手动输入时长（秒）", "60");
    const sec = Number(input);
    if (!Number.isFinite(sec) || sec < 1) {
      throw new Error("invalid duration");
    }
    return Math.round(sec);
  } finally {
    URL.revokeObjectURL(url);
  }
}
</script>

<style scoped>
.audio-upload {
  display: flex;
  gap: 8px;
  align-items: center;
}
.audio-upload__field {
  width: 110px;
}
.audio-upload__input {
  display: none;
}
</style>
