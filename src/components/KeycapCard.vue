<template>
  <section class="card">
    <h3 class="mono">{{ t("card.keycap.title") }}</h3>
    <div class="row">
      <label class="field grow">
        <span>{{ t("card.keycap.bg") }}</span>
        <input type="color" :value="curDesign.bg" @input="setCur('bg', $event.target.value)">
      </label>
      <label class="field grow">
        <span>{{ t("card.keycap.legendColor") }}</span>
        <div class="color-line">
          <input type="color" :value="curDesign.legendColor || autoLegend"
            @input="setCur('legendColor', $event.target.value)">
          <button class="btn tiny ghost" @click="legendAuto" :title="t('card.keycap.autoTitle')">
            {{ t("card.keycap.auto") }}
          </button>
        </div>
      </label>
    </div>
    <label class="field">
      <span>{{ t("card.keycap.legend") }}</span>
      <input type="text" maxlength="16" :placeholder="t('card.keycap.legendPlaceholder')"
        :value="curDesign.legend || ''" @input="setCur('legend', $event.target.value)">
    </label>
    <label class="field">
      <span>{{ t("card.keycap.legendSize") }} <b>{{ (curDesign.legendSize || 1).toFixed(2) }}x</b></span>
      <input type="range" min="0.5" max="1.8" step="0.05"
        :value="curDesign.legendSize || 1" @input="setCur('legendSize', +$event.target.value)">
    </label>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const { curDesign, autoLegend, setCur, legendAuto } = inject("studio");
</script>
