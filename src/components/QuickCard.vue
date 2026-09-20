<template>
  <section class="card">
    <h3 class="mono">{{ t("card.quick.title") }}</h3>
    <div class="btn-grid">
      <button class="btn ghost small" @click="applyAll">{{ t("card.quick.applyAll") }}</button>
      <button class="btn ghost small" @click="resetKey">{{ t("card.quick.reset") }}</button>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const { applyAll, resetKey } = inject("studio");
</script>
