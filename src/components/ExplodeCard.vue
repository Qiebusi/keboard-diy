<template>
  <section class="card global-card">
    <h3 class="mono">3D 分层拆解</h3>
    <div class="btn-grid">
      <button class="btn" :class="{ active: state.explode }" @click="toggleExplode">
        {{ state.explode ? '收起分层' : '分层展开' }}
      </button>
    </div>
    <label class="field" v-if="state.explode">
      <span>层间距 <b>{{ (+state.explodeGap).toFixed(2) }}x</b></span>
      <input type="range" min="0.4" max="2" step="0.05"
        :value="state.explodeGap" @input="setExplodeGap(+$event.target.value)">
    </label>
    <div class="field">
      <span>层显示 <b>{{ layerCount }}/{{ layerList.length }}</b></span>
      <div class="layer-grid">
        <button v-for="L in layerList" :key="L.id" class="btn tiny"
          :class="{ active: state.layerVis[L.id] }" :title="'显示 / 隐藏：' + L.name"
          @click="toggleLayer(L.id)">{{ L.name }}</button>
      </div>
    </div>
    <div class="btn-grid">
      <button class="btn ghost tiny" @click="showAllLayers">全部显示</button>
    </div>
    <small v-if="state.explode">自下而上：下壳 → PCB（轴座 / 卫星轴）→ 定位板 → 上盖边框 → 轴体 → 键帽</small>
  </section>
</template>

<script setup>
import { inject } from "vue";

const {
  state, toggleExplode, setExplodeGap,
  layerList, layerCount, toggleLayer, showAllLayers
} = inject("studio");
</script>
