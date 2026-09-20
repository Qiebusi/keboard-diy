<template>
  <section class="card global-card">
    <h3 class="mono">全局</h3>
    <label class="field">
      <span>键帽高度档案（3D）</span>
      <select :value="state.profile" @change="onProfileChange($event)">
        <option value="oem">OEM · 常见机械键盘</option>
        <option value="cherry">Cherry · 原厂低矮</option>
        <option value="sa">SA · 高球帽</option>
        <option value="dsa">DSA · 等高球帽</option>
        <option value="xda">XDA · 等高平顶</option>
      </select>
    </label>
    <label class="field">
      <span>全局键帽颜色</span>
      <input type="color" id="capColorAll" :value="capColorAll" @input="applyGlobalColor($event)">
    </label>
    <label class="field">
      <span>键盘底板颜色</span>
      <input type="color" :value="state.plateColor" @input="state.plateColor = $event.target.value">
    </label>
    <label class="field">
      <span>界面主题</span>
      <select :value="theme" @change="setTheme($event.target.value)">
        <option value="classic">经典 · 暖纸工作台</option>
        <option value="tech">科技 · 暗夜霓虹</option>
      </select>
    </label>
  </section>
</template>

<script setup>
import { inject } from "vue";

const { state, capColorAll, applyGlobalColor, theme, setTheme, onProfileChange } = inject("studio");
</script>
