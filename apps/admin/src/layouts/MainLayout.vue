<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout__aside">
      <div class="layout__logo">
        <span class="layout__logo-icon">🌙</span>
        <span class="layout__logo-text">神游运营后台</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="layout__menu"
        background-color="transparent"
        text-color="var(--el-text-color-secondary)"
        active-text-color="var(--el-color-primary)"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        <el-menu-item index="/journeys">
          <el-icon><MapLocation /></el-icon>
          <span>旅程管理</span>
        </el-menu-item>
        <el-menu-item index="/pipeline">
          <el-icon><Cpu /></el-icon>
          <span>AI 管线控制台</span>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <span>用户与订阅</span>
        </el-menu-item>
        <el-menu-item index="/audit-logs">
          <el-icon><Document /></el-icon>
          <span>操作审计</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout__header" height="56px">
        <div class="layout__title">{{ route.meta.title || "" }}</div>
        <el-dropdown @command="onUserCommand">
          <span class="layout__user">
            <el-icon><Avatar /></el-icon>
            <span class="layout__user-name">{{ authStore.displayName }}</span>
            <el-tag size="small" type="primary" effect="plain">管理员</el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>
                {{ authStore.profile?.phone || authStore.profile?.email || "—" }}
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main class="layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ElMessageBox } from "element-plus";
import { Avatar, Cpu, DataAnalysis, Document, MapLocation, User } from "@element-plus/icons-vue";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const authStore = useAuthStore();

const activeMenu = computed(() => {
  // 管线章节详情页高亮「AI 管线控制台」
  if (route.path.startsWith("/pipeline")) return "/pipeline";
  if (route.path.startsWith("/journeys")) return "/journeys";
  return route.path;
});

async function onUserCommand(command: string) {
  if (command === "logout") {
    await ElMessageBox.confirm("确定退出登录吗？", "退出登录", {
      confirmButtonText: "退出",
      cancelButtonText: "取消",
      type: "warning",
    });
    await authStore.logout();
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.layout__aside {
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
}
.layout__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.layout__logo-icon {
  font-size: 20px;
}
.layout__menu {
  border-right: none;
  flex: 1;
}
.layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background-color: var(--el-bg-color);
}
.layout__title {
  font-size: 15px;
  font-weight: 500;
}
.layout__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--el-text-color-regular);
}
.layout__main {
  background-color: var(--el-bg-color-page);
  padding: 20px;
}
</style>
