import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { getAccessToken, getStoredIsAdmin } from "@/api/request";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("@/views/LoginView.vue"),
    meta: { title: "登录" },
  },
  {
    path: "/",
    component: () => import("@/layouts/MainLayout.vue"),
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("@/views/DashboardView.vue"),
        meta: { title: "数据看板" },
      },
      {
        path: "journeys",
        name: "journeys",
        component: () => import("@/views/JourneyListView.vue"),
        meta: { title: "旅程管理" },
      },
      {
        path: "journeys/new",
        name: "journey-new",
        component: () => import("@/views/JourneyEditView.vue"),
        meta: { title: "新建旅程" },
      },
      {
        path: "journeys/:id",
        name: "journey-edit",
        component: () => import("@/views/JourneyEditView.vue"),
        meta: { title: "编辑旅程" },
      },
      {
        path: "pipeline",
        name: "pipeline",
        component: () => import("@/views/PipelineConsoleView.vue"),
        meta: { title: "AI 管线控制台" },
      },
      {
        path: "pipeline/chapters/:id",
        name: "chapter-pipeline",
        component: () => import("@/views/ChapterPipelineView.vue"),
        meta: { title: "章节管线" },
      },
      {
        path: "users",
        name: "users",
        component: () => import("@/views/UserListView.vue"),
        meta: { title: "用户与订阅" },
      },
      {
        path: "audit-logs",
        name: "audit-logs",
        component: () => import("@/views/AuditLogView.vue"),
        meta: { title: "操作审计" },
      },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 全局前置守卫：未登录跳 /login；已确认非 admin 跳登录并提示。
 * 后端 AdminGuard 是最终防线，此处仅做体验层拦截。
 */
router.beforeEach((to) => {
  const token = getAccessToken();
  if (to.path === "/login") {
    return token ? "/dashboard" : true;
  }
  if (!token) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  // localStorage 中显式记录为非管理员 → 直接拦回登录页
  if (getAccessToken() && getStoredIsAdmin() === false && localStorage.getItem("shenyou_admin_profile")) {
    return { path: "/login" };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 神游运营后台` : "神游运营后台";
});

export default router;
