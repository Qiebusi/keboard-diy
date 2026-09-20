<template>
  <div id="key3dOverlay" :class="{ show: zoom3d }">
    <div class="key3d-overlay-stage" ref="overlayStageRef"></div>
    <button id="btnZoomClose" class="btn tiny" @click="zoomClose">{{ t("key3d.exit") }}</button>
  </div>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const { zoom3d, zoomClose, overlayStageRef } = inject("studio");
</script>
