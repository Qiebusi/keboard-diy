<template>
  <div>
    <div class="key-head">
      <div class="key-title">{{ keyTitle }}</div>
      <div class="key-sub mono">{{ keySub }}</div>
    </div>

    <KeycapCard />
    <ImageCard />
    <QuickCard />
  </div>
</template>

<script setup>
import { inject } from "vue";
import KeycapCard from "./KeycapCard.vue";
import ImageCard from "./ImageCard.vue";
import QuickCard from "./QuickCard.vue";

const { keyTitle, keySub } = inject("studio");
</script>
