<template>
  <div class="key3d-card" id="key3dCard">
    <div class="key3d-head">
      <span class="tag">{{ t("key3d.title") }}</span>
      <span class="key3d-actions">
        <button class="btn tiny" @click="zoomOpen">{{ t("key3d.zoom") }}</button>
        <button class="btn tiny" :disabled="!hasSel" @click="exportKey3d">{{ t("key3d.export") }}</button>
      </span>
    </div>
    <div class="key3d-stage" ref="key3dHomeRef">
      <canvas id="key3d" ref="key3dRef" v-show="hasSel"></canvas>
      <div class="key3d-empty" v-show="!hasSel">
        {{ t("key3d.emptyTitle") }}<br><small>{{ t("key3d.emptyHint") }}</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const { hasSel, zoomOpen, exportKey3d, key3dHomeRef, key3dRef } = inject("studio");
</script>
