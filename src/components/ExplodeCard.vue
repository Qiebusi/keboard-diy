<template>
  <section class="card global-card">
    <h3 class="mono">{{ t("card.explode.title") }}</h3>
    <div class="btn-grid">
      <button class="btn" :class="{ active: state.explode }" @click="toggleExplode">
        {{ state.explode ? t("card.explode.off") : t("card.explode.on") }}
      </button>
    </div>
    <label class="field" v-if="state.explode">
      <span>{{ t("card.explode.gap") }} <b>{{ (+state.explodeGap).toFixed(2) }}x</b></span>
      <input type="range" min="0.4" max="2" step="0.05"
        :value="state.explodeGap" @input="setExplodeGap(+$event.target.value)">
    </label>
    <div class="field">
      <span>{{ t("card.explode.layers") }} <b>{{ layerCount }}/{{ layerList.length }}</b></span>
      <div class="layer-grid">
        <button v-for="L in layerList" :key="L.id" class="btn tiny"
          :class="{ active: state.layerVis[L.id] }" :title="L.name"
          @click="toggleLayer(L.id)">{{ L.name }}</button>
      </div>
    </div>
    <div class="btn-grid">
      <button class="btn ghost tiny" @click="showAllLayers">{{ t("card.explode.showAll") }}</button>
    </div>
    <small v-if="state.explode">{{ t("card.explode.desc") }}</small>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const {
  state, toggleExplode, setExplodeGap,
  layerList, layerCount, toggleLayer, showAllLayers
} = inject("studio");
</script>
