<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-logo"></span>
      <div class="brand-text">
        <strong>键帽工坊</strong>
        <small class="mono">KEYCAP STUDIO · 1U = 19.05MM</small>
      </div>
    </div>

    <div class="toolbar">
      <label class="field">
        <select :value="state.layoutName" @change="onLayoutChange($event)">
          <option value="60">60% · 61 键</option>
          <option value="75">75% · 87 键</option>
          <option value="tkl">87 键 TKL</option>
          <option value="full">104 键全尺寸</option>
          <option v-if="state.customRows" value="custom">KLE 自定义布局</option>
        </select>
      </label>

      <button class="btn ghost" @click="importKLEClick"
        title="导入 Keyboard Layout Editor (KLE) JSON 布局">导入 KLE</button>

      <div class="mode-switch" role="group" aria-label="视图模式切换">
        <button :class="{ on: state.mode === 'flat' }" @click="setMode('flat')">平面</button>
        <button :class="{ on: state.mode === '3d' }" @click="setMode('3d')">3D</button>
      </div>

      <span class="sep"></span>
      <button class="btn" @click="exportBoard">导出整盘</button>
      <button class="btn" @click="exportKey">导出当前键帽</button>
      <span class="sep"></span>
      <button class="btn ghost" @click="saveProject">保存工程</button>
      <button class="btn ghost" @click="loadProjectClick">载入工程</button>
      <button class="btn ghost danger" @click="clearAll">清空</button>
    </div>
  </header>
</template>

<script setup>
import { inject } from "vue";

const {
  state, onLayoutChange, importKLEClick, setMode,
  exportBoard, exportKey, saveProject, loadProjectClick, clearAll
} = inject("studio");
</script>
