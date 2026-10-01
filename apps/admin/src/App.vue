<template>
  <ConfigProvider :locale="zhCn">
    <router-view />
  </ConfigProvider>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { ElConfigProvider } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import type { Language } from "element-plus/es/locale";
import type { DefineComponent } from "vue";
import { useAuthStore } from "@/stores/auth";

// element-plus 2.11 的 ConfigProvider locale prop 类型声明有误（把运行时 prop 定义当成了值类型），
// 此处将组件类型收窄为真实契约 { locale?: Language }，运行时不受影响。
const ConfigProvider = ElConfigProvider as unknown as DefineComponent<{ locale?: Language }>;

const authStore = useAuthStore();

onMounted(() => {
  // 启动时尝试恢复登录态（Web 端使用 localStorage，见 stores/auth.ts 注释）
  authStore.restore();
});
</script>
