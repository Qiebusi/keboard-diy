<template>
  <section class="card">
    <h3 class="mono">键帽 / 图例</h3>
    <div class="row">
      <label class="field grow">
        <span>底色</span>
        <input type="color" :value="curDesign.bg" @input="setCur('bg', $event.target.value)">
      </label>
      <label class="field grow">
        <span>图例颜色</span>
        <div class="color-line">
          <input type="color" :value="curDesign.legendColor || autoLegend"
            @input="setCur('legendColor', $event.target.value)">
          <button class="btn tiny ghost" @click="legendAuto" title="跟随底色自动配色">自动</button>
        </div>
      </label>
    </div>
    <label class="field">
      <span>图例文字（留空隐藏）</span>
      <input type="text" maxlength="16" placeholder="例如：A / Esc / 自定义"
        :value="curDesign.legend || ''" @input="setCur('legend', $event.target.value)">
    </label>
    <label class="field">
      <span>图例大小 <b>{{ (curDesign.legendSize || 1).toFixed(2) }}x</b></span>
      <input type="range" min="0.5" max="1.8" step="0.05"
        :value="curDesign.legendSize || 1" @input="setCur('legendSize', +$event.target.value)">
    </label>
  </section>
</template>

<script setup>
import { inject } from "vue";

const { curDesign, autoLegend, setCur, legendAuto } = inject("studio");
</script>
