import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shenyou/shared": fileURLToPath(
        new URL("../../packages/shared/src", import.meta.url)
      ),
    },
  },
  server: {
    // 5173 被本机另一项目占用，固定 5174 并禁止自动顺延（CORS 白名单按端口配置）
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
