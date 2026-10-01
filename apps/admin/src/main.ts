import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import App from "./App.vue";
import router from "./router";
import "./styles/main.css";

const app = createApp(App);

app.use(createPinia());
app.use(router);
// 中文语言包经 App.vue 的 ElConfigProvider 注入（app.use 的 locale 选项与新版类型不兼容）
app.use(ElementPlus);

app.mount("#app");
