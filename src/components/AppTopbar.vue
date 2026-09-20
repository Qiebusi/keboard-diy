<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-logo"></span>
      <div class="brand-text">
        <strong>{{ t("app.title") }}</strong>
        <small class="mono">{{ t("app.subtitle") }}</small>
      </div>
    </div>

    <div class="toolbar">
      <label class="field">
        <select :value="state.layoutName" @change="onLayoutChange($event)">
          <option value="60">{{ t("topbar.layout60") }}</option>
          <option value="75">{{ t("topbar.layout75") }}</option>
          <option value="tkl">{{ t("topbar.layoutTkl") }}</option>
          <option value="full">{{ t("topbar.layoutFull") }}</option>
          <option v-if="state.customRows" value="custom">{{ t("topbar.layoutCustom") }}</option>
        </select>
      </label>

      <button class="btn ghost" @click="importKLEClick" :title="t('topbar.importKleTitle')">
        {{ t("topbar.importKle") }}
      </button>

      <div class="mode-switch" role="group" aria-label="view mode">
        <button :class="{ on: state.mode === 'flat' }" @click="setMode('flat')">{{ t("topbar.flat") }}</button>
        <button :class="{ on: state.mode === '3d' }" @click="setMode('3d')">{{ t("topbar.mode3d") }}</button>
      </div>

      <span class="sep"></span>
      <button class="btn" @click="exportBoard">{{ t("topbar.exportBoard") }}</button>
      <button class="btn" @click="exportKey">{{ t("topbar.exportKey") }}</button>
      <span class="sep"></span>
      <button class="btn ghost" @click="saveProject">{{ t("topbar.save") }}</button>
      <button class="btn ghost" @click="loadProjectClick">{{ t("topbar.load") }}</button>
      <button class="btn ghost danger" @click="clearAll">{{ t("topbar.clear") }}</button>
    </div>
  </header>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const {
  state, onLayoutChange, importKLEClick, setMode,
  exportBoard, exportKey, saveProject, loadProjectClick, clearAll
} = inject("studio");
</script>
