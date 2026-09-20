<template>
  <div id="key3dOverlay" :class="{ show: zoom3d }">
    <div class="key3d-overlay-stage" ref="overlayStageRef"></div>
    <button id="btnZoomClose" class="btn tiny" @click="zoomClose">退出放大 (Esc)</button>
  </div>
</template>

<script setup>
import { inject } from "vue";

const { zoom3d, zoomClose, overlayStageRef } = inject("studio");
</script>
