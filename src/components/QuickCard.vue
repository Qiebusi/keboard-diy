<template>
  <section class="card">
    <h3 class="mono">快捷操作</h3>
    <div class="btn-grid">
      <button class="btn ghost small" @click="applyAll">此设计应用到全部键</button>
      <button class="btn ghost small" @click="resetKey">重置此键</button>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";

const { applyAll, resetKey } = inject("studio");
</script>
