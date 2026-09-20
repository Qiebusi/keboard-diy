<template>
  <AppTopbar />

  <main class="workspace">
    <BoardStage />

    <aside class="panel" id="panel">
      <div class="panel-empty" v-if="!hasSel">在左侧点击一个键帽开始设计</div>
      <KeyPanel v-else />

      <GlobalCard />
      <ExplodeCard v-if="state.mode === '3d'" />
    </aside>
  </main>

  <ToastNote />

  <Key3DOverlay />

  <!-- 文件选择器（KLE 布局 / 工程存档） -->
  <input type="file" accept=".json,application/json" hidden ref="kleInputRef" @change="onKLEFile($event)">
  <input type="file" accept=".json,application/json" hidden ref="projInputRef" @change="onProjFile($event)">
</template>

<script setup>
/* =========================================================
 * 根组件：只负责布局与 provide 状态源
 * - 状态与动作集中在 composables/useStudio.js
 * - 子组件通过 inject("studio") 取用
 * ========================================================= */
import { provide } from "vue";
import { useStudio } from "./composables/useStudio.js";

import AppTopbar from "./components/AppTopbar.vue";
import BoardStage from "./components/BoardStage.vue";
import KeyPanel from "./components/KeyPanel.vue";
import GlobalCard from "./components/GlobalCard.vue";
import ExplodeCard from "./components/ExplodeCard.vue";
import Key3DOverlay from "./components/Key3DOverlay.vue";
import ToastNote from "./components/ToastNote.vue";

const studio = useStudio();
provide("studio", studio);

/* 本组件模板用到的绑定（其余由子组件各自 inject） */
const { state, hasSel, kleInputRef, projInputRef, onKLEFile, onProjFile } = studio;

/* 开发态调试句柄：浏览器控制台 / 自动化测试用 */
if (import.meta.env.DEV) window.__studio = studio;
</script>
