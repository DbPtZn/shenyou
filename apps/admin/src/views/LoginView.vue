<template>
  <div class="login">
    <el-card class="login__card">
      <div class="login__brand">
        <span class="login__moon">🌙</span>
        <h1 class="login__title">神游运营后台</h1>
        <p class="login__subtitle">准备好了，我们开始今晚的工作</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="onSubmit">
        <el-form-item prop="account">
          <el-input v-model="form.account" placeholder="手机号或邮箱" :prefix-icon="User" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-alert
          v-if="errorMsg"
          :title="errorMsg"
          type="error"
          show-icon
          :closable="false"
          class="login__alert"
        />
        <el-button type="primary" class="login__submit" :loading="loading" native-type="submit">
          登录
        </el-button>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Lock, User } from "@element-plus/icons-vue";
import type { FormInstance, FormRules } from "element-plus";
import { AxiosError } from "axios";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const form = reactive({ account: "", password: "" });
const rules: FormRules = {
  account: [{ required: true, message: "请输入手机号或邮箱", trigger: "blur" }],
  password: [{ required: true, message: "请输入密码", trigger: "blur" }],
};

const loading = ref(false);
const errorMsg = ref("");

async function onSubmit() {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  errorMsg.value = "";
  try {
    await authStore.login(form.account.trim(), form.password);
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
    await router.replace(redirect);
  } catch (error) {
    if (error instanceof AxiosError) {
      const data = error.response?.data as { message?: string } | undefined;
      errorMsg.value = data?.message || "登录失败，请稍后再试";
    } else if (error instanceof Error) {
      errorMsg.value = error.message;
    } else {
      errorMsg.value = "登录失败，请稍后再试";
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(139, 156, 255, 0.15), transparent 55%),
    var(--el-bg-color-page);
}
.login__card {
  width: 400px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
}
.login__brand {
  text-align: center;
  margin-bottom: 24px;
}
.login__moon {
  font-size: 36px;
}
.login__title {
  margin: 8px 0 4px;
  font-size: 22px;
  font-weight: 600;
}
.login__subtitle {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.login__alert {
  margin-bottom: 16px;
}
.login__submit {
  width: 100%;
}
</style>
