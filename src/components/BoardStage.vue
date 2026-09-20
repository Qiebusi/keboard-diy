<template>
  <section class="canvas-area">
    <div class="canvas-scroll" ref="scrollRef">
      <canvas id="board" ref="boardRef" v-show="state.mode !== '3d'"></canvas>
      <canvas id="board3d" ref="board3dRef" v-show="state.mode === '3d'"></canvas>
    </div>

    <Key3DCard />

    <div class="hintbar" v-html="hint"></div>
  </section>
</template>

<script setup>
import { inject } from "vue";
import Key3DCard from "./Key3DCard.vue";

const { state, hint, scrollRef, boardRef, board3dRef } = inject("studio");
</script>
