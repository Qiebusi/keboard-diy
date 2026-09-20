<template>
  <section class="card global-card">
    <h3 class="mono">{{ t("card.global.title") }}</h3>
    <label class="field">
      <span>{{ t("card.global.profile") }}</span>
      <select :value="state.profile" @change="onProfileChange($event)">
        <option value="oem">{{ t("profile.oem") }}</option>
        <option value="cherry">{{ t("profile.cherry") }}</option>
        <option value="sa">{{ t("profile.sa") }}</option>
        <option value="dsa">{{ t("profile.dsa") }}</option>
        <option value="xda">{{ t("profile.xda") }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ t("card.global.capColor") }}</span>
      <input type="color" id="capColorAll" :value="capColorAll" @input="applyGlobalColor($event)">
    </label>
    <label class="field">
      <span>{{ t("card.global.plateColor") }}</span>
      <input type="color" :value="state.plateColor" @input="state.plateColor = $event.target.value">
    </label>
    <label class="field">
      <span>{{ t("card.global.theme") }}</span>
      <select :value="theme" @change="setTheme($event.target.value)">
        <option value="classic">{{ t("card.global.themeClassic") }}</option>
        <option value="tech">{{ t("card.global.themeTech") }}</option>
      </select>
    </label>
    <label class="field">
      <span>{{ t("card.global.language") }}</span>
      <select :value="locale" @change="setLocale($event.target.value)">
        <option v-for="L in langs" :key="L.id" :value="L.id">{{ L.label }}</option>
      </select>
    </label>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { locale, t, setLocale, langs } = useI18n();
const { state, capColorAll, applyGlobalColor, theme, setTheme, onProfileChange } = inject("studio");
</script>
