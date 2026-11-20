<script setup lang="ts">
import { computed, ref } from "vue";
import { Aperture, Type, Upload } from "lucide-vue-next";
import { useStudio } from "../../../shared/useStudio";
import { glyphLabel } from "../../mapping/lib/charsets";
import GlyphBench from "./GlyphBench.vue";
import TendencyCompare from "./TendencyCompare.vue";
import { cellMetrics } from "../../../shared/cell";

const { doc, calibration } = useStudio();
const fileInput = ref<HTMLInputElement | null>(null);
const state = calibration.state;
const metrics = computed(() => cellMetrics(doc.settings));

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await calibration.loadFile(file);
  input.value = "";
}

function pick() {
  fileInput.value?.click();
}

const canUse = computed(() => !!state.font && state.calibration?.glyphs.length);
</script>

<template>
  <section class="calibration-panel" data-testid="calibration-panel">
    <div class="section-title calibration-title">
      <span>03 / GLYPH CALIBRATION · 字形标定台</span><Aperture :size="15" />
    </div>

    <div class="calibration-layout">
      <div class="calibration-controls">
        <div class="font-actions">
          <button type="button" class="secondary font-button" @click="pick">
            <Upload :size="14" /> 加载字体
          </button>
          <button
            type="button"
            class="secondary font-button"
            :disabled="state.status === 'loading'"
            @click="calibration.loadBundled()"
          >
            <Type :size="14" /> 内置等宽
          </button>
        </div>
        <input
          ref="fileInput"
          data-testid="font-input"
          class="font-input"
          type="file"
          accept=".ttf,.otf,.woff,.woff2,.ttc,font/ttf,font/otf,font/woff,font/woff2"
          @change="onFile"
        />

        <div
          v-if="state.status === 'loading'"
          class="font-progress"
          role="status"
          data-testid="font-loading"
        >
          正在加载字体… {{ state.pending }}
        </div>
        <div v-else-if="state.status === 'error'" class="font-error" role="alert">
          {{ state.error }}
          <small v-if="state.font">已保留上一份可用字体与标定。</small>
        </div>

        <div class="field-block">
          <div class="field-block-title">
            <span>候选字符</span>
            <button
              type="button"
              class="link-button"
              :disabled="doc.settings.charset === 'custom'"
              @click="doc.settings.charset = 'custom'"
            >
              转为自定义
            </button>
          </div>
          <div class="candidate-strip" data-testid="candidate-strip">
            <span
              v-for="char in calibration.candidates(doc.settings)"
              :key="char"
              class="candidate-chip"
              :class="{ missing: state.calibration?.missing.includes(char) }"
              :title="`U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`"
              >{{ glyphLabel(char) }}</span
            >
          </div>
        </div>

        <div class="cell-fields">
          <label class="field cell-field"
            >字号 <b>{{ metrics.fontSize }}</b
            ><input
              aria-label="字号"
              type="range"
              min="6"
              max="48"
              step="1"
              v-model.number="doc.settings.fontSize"
          /></label>
          <label class="field cell-field"
            >字符宽 <b>{{ metrics.cellWidth }}</b
            ><input
              aria-label="字符框宽度"
              type="range"
              min="3"
              max="48"
              step="1"
              v-model.number="doc.settings.cellWidth"
          /></label>
          <label class="field cell-field"
            >字符高 <b>{{ metrics.cellHeight }}</b
            ><input
              aria-label="字符框高度"
              type="range"
              min="6"
              max="72"
              step="1"
              v-model.number="doc.settings.cellHeight"
          /></label>
        </div>

        <div class="mapping-modes" role="radiogroup" aria-label="字符映射">
          <button
            type="button"
            role="radio"
            :aria-checked="doc.settings.mapping === 'preset'"
            :class="{ active: doc.settings.mapping === 'preset' }"
            @click="doc.settings.mapping = 'preset'"
          >
            预设顺序
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="doc.settings.mapping === 'ink'"
            :class="{ active: doc.settings.mapping === 'ink' }"
            :disabled="!canUse"
            @click="doc.settings.mapping = 'ink'"
          >
            平均墨色
          </button>
          <button
            type="button"
            role="radio"
            :aria-checked="doc.settings.mapping === 'structure'"
            :class="{ active: doc.settings.mapping === 'structure' }"
            :disabled="!canUse"
            @click="doc.settings.mapping = 'structure'"
          >
            局部结构
          </button>
        </div>

        <p class="hint calibration-hint">
          预设顺序直接按字符集顺序取字；平均墨色与局部结构会先测量字体的真实覆盖率，
          缺失字形会被剔除并列出。切换字号、字符框或候选字符后，标定与图像会一起重算。
        </p>
      </div>

      <div class="calibration-stage">
        <GlyphBench
          :calibration="calibration"
          :grid="doc.grid"
          :status="state.status"
          label="字形标定"
        />

        <TendencyCompare
          v-if="state.calibration && state.font"
          :calibration="state.calibration"
          :settings="doc.settings"
          :family="state.font.family"
          :monospace="state.font.monospace"
        />
      </div>
    </div>
  </section>
</template>
