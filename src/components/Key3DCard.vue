<template>
  <div class="key3d-card" id="key3dCard">
    <div class="key3d-head">
      <span class="tag">单键 3D 预览</span>
      <span class="key3d-actions">
        <button class="btn tiny" @click="zoomOpen">放大</button>
        <button class="btn tiny" :disabled="!hasSel" @click="exportKey3d">导出</button>
      </span>
    </div>
    <div class="key3d-stage" ref="key3dHomeRef">
      <canvas id="key3d" ref="key3dRef" v-show="hasSel"></canvas>
      <div class="key3d-empty" v-show="!hasSel">在键盘中点击一颗键帽<br><small>拖拽旋转 · 滚轮缩放</small></div>
    </div>
  </div>
</template>

<script setup>
import { inject } from "vue";

const { hasSel, zoomOpen, exportKey3d, key3dHomeRef, key3dRef } = inject("studio");
</script>
