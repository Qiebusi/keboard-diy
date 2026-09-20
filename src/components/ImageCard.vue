<template>
  <section class="card">
    <h3 class="mono">{{ t("card.image.title") }}</h3>
    <div class="upload-zone" id="uploadZone">
      <input type="file" accept="image/*" hidden ref="imgInputRef" @change="onImgFile($event)">
      <button class="btn primary" @click="uploadClick">{{ t("card.image.upload") }}</button>
      <small>{{ t("card.image.formats") }}<br>{{ t("card.image.drop") }}</small>
    </div>

    <div v-if="curDesign.img">
      <label class="field">
        <span>{{ t("card.image.wrap") }}</span>
        <select :value="imgWrapShown" @change="setImg('wrap', $event.target.value)">
          <option value="top">{{ t("card.image.wrapTop") }}</option>
          <option value="net">{{ t("card.image.wrapNet") }}</option>
        </select>
      </label>
      <div v-show="netShow">
        <span class="mono">{{ t("card.image.netPreview") }}</span>
        <canvas id="netPreview" ref="netPreviewRef"></canvas>
      </div>
      <label class="field">
        <span>{{ t("card.image.scale") }} <b>{{ (curDesign.img.scale || 1).toFixed(2) }}x</b></span>
        <input type="range" min="0.2" max="4" step="0.01"
          :value="curDesign.img.scale || 1" @input="setImg('scale', +$event.target.value)">
      </label>
      <label class="field">
        <span>{{ t("card.image.rotate") }} <b>{{ Math.round(curDesign.img.rot || 0) }}°</b></span>
        <input type="range" min="-180" max="180" step="1"
          :value="curDesign.img.rot || 0" @input="setImg('rot', +$event.target.value)">
      </label>
      <label class="field">
        <span>{{ t("card.image.ox") }} <b>{{ (curDesign.img.ox || 0).toFixed(2) }}</b></span>
        <input type="range" min="-1" max="1" step="0.01"
          :value="curDesign.img.ox || 0" @input="setImg('ox', +$event.target.value)">
      </label>
      <label class="field">
        <span>{{ t("card.image.oy") }} <b>{{ (curDesign.img.oy || 0).toFixed(2) }}</b></span>
        <input type="range" min="-1" max="1" step="0.01"
          :value="curDesign.img.oy || 0" @input="setImg('oy', +$event.target.value)">
      </label>
      <button class="btn ghost small" @click="removeImg">{{ t("card.image.remove") }}</button>
    </div>
  </section>
</template>

<script setup>
import { inject } from "vue";
import { useI18n } from "../composables/useI18n.js";

const { t } = useI18n();
const {
  curDesign, netShow, imgWrapShown, imgInputRef, netPreviewRef,
  uploadClick, onImgFile, setImg, removeImg
} = inject("studio");
</script>
