<template>
  <section class="card">
    <h3 class="mono">图片贴图</h3>
    <div class="upload-zone" id="uploadZone">
      <input type="file" accept="image/*" hidden ref="imgInputRef" @change="onImgFile($event)">
      <button class="btn primary" @click="uploadClick">上传图片</button>
      <small> JPG / PNG / WebP · 自动铺满键帽顶面<br>也可拖入图片或 Ctrl+V 粘贴</small>
    </div>

    <div v-if="curDesign.img">
      <label class="field">
        <span>贴图范围</span>
        <select :value="imgWrapShown" @change="setImg('wrap', $event.target.value)">
          <option value="top">仅顶面</option>
          <option value="net">十字展开包裹（顶面+四壁）</option>
        </select>
      </label>
      <div v-show="netShow">
        <span class="mono">取模预览 · 十字展开</span>
        <canvas id="netPreview" ref="netPreviewRef"></canvas>
      </div>
      <label class="field">
        <span>缩放 <b>{{ (curDesign.img.scale || 1).toFixed(2) }}x</b></span>
        <input type="range" min="0.2" max="4" step="0.01"
          :value="curDesign.img.scale || 1" @input="setImg('scale', +$event.target.value)">
      </label>
      <label class="field">
        <span>旋转 <b>{{ Math.round(curDesign.img.rot || 0) }}°</b></span>
        <input type="range" min="-180" max="180" step="1"
          :value="curDesign.img.rot || 0" @input="setImg('rot', +$event.target.value)">
      </label>
      <label class="field">
        <span>水平位置 <b>{{ (curDesign.img.ox || 0).toFixed(2) }}</b></span>
        <input type="range" min="-1" max="1" step="0.01"
          :value="curDesign.img.ox || 0" @input="setImg('ox', +$event.target.value)">
      </label>
      <label class="field">
        <span>垂直位置 <b>{{ (curDesign.img.oy || 0).toFixed(2) }}</b></span>
        <input type="range" min="-1" max="1" step="0.01"
          :value="curDesign.img.oy || 0" @input="setImg('oy', +$event.target.value)">
      </label>
      <button class="btn ghost small" @click="removeImg">移除图片</button>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";

const {
  curDesign, netShow, imgWrapShown, imgInputRef, netPreviewRef,
  uploadClick, onImgFile, setImg, removeImg
} = inject("studio");
</script>
