/* =========================================================
 * 应用入口：挂载根组件 + 引入全局样式
 * ========================================================= */
import { createApp } from "vue";
import App from "./App.vue";
import "./styles/style.css";

createApp(App).mount("#app");
