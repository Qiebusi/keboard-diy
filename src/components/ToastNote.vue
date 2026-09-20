<template>
  <div class="toast" :class="{ show: toastOn }">{{ toastMsg }}</div>
</template>

<script setup>
import { inject } from "vue";

const { toastOn, toastMsg } = inject("studio");
</script>
