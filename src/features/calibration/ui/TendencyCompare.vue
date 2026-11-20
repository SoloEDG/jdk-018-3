<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Settings } from "../../../shared/document";
import type { Calibration } from "../../../shared/font";
import { cellMetrics } from "../../../shared/cell";
import { drawGrid } from "../../preview";
import { compareFixtures } from "../lib/compare";

const props = defineProps<{
  calibration: Calibration | null;
  settings: Settings;
  family: string;
  monospace: boolean;
}>();

const metrics = computed(() =>
  cellMetrics({
    fontSize: props.settings.fontSize,
    cellWidth: props.settings.cellWidth,
    cellHeight: props.settings.cellHeight,
  }),
);

const compared = computed(() => {
  const cal = props.calibration;
  if (!cal || !cal.glyphs.length) return [];
  return compareFixtures(cal, props.settings, metrics.value, props.family, props.monospace);
});

const canvases = new Map<string, HTMLCanvasElement>();

function register(key: string, el: unknown) {
  if (el instanceof HTMLCanvasElement) canvases.set(key, el);
  else canvases.delete(key);
}

function paint() {
  for (const item of compared.value) {
    for (const mode of ["ink", "structure"] as const) {
      const canvas = canvases.get(`${item.fixture.id}:${mode}`);
      if (canvas) drawGrid(canvas, item[mode].grid, false, "#05070a", 1);
    }
  }
}

watch(
  () => [
    props.calibration?.revision,
    props.settings.fontSize,
    props.settings.cellWidth,
    props.settings.cellHeight,
    props.settings.contrast,
    props.settings.gamma,
    props.settings.invert,
    props.family,
  ],
  () => requestAnimationFrame(paint),
  { flush: "post" },
);
onMounted(() => requestAnimationFrame(paint));
onBeforeUnmount(() => canvases.clear());

function percent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
</script>

<template>
  <section class="fixture-compare" data-testid="fixture-compare">
    <header class="fixture-head">
      <h4>细线图 / 渐变图 · 两种倾向取舍</h4>
      <span class="mono muted">墨色误差 / 结构误差</span>
    </header>
    <div v-if="!compared.length" class="hint">
      加载字体后，这里会用同一组候选渲染细线与渐变对照。
    </div>
    <div v-else class="fixture-grid">
      <article v-for="item in compared" :key="item.fixture.id" class="fixture-card">
        <div class="fixture-title">
          <strong>{{ item.fixture.name }}</strong>
          <small>{{ item.fixture.caption }}</small>
        </div>
        <div class="fixture-pair">
          <figure>
            <figcaption>只看平均墨色</figcaption>
            <canvas
              :ref="(el) => register(`${item.fixture.id}:ink`, el)"
              aria-label="只看平均墨色的对照"
            />
            <small class="mono"
              >{{ percent(item.ink.inkError) }} /
              {{ percent(item.ink.structureError) }}</small
            >
          </figure>
          <figure>
            <figcaption>兼顾局部结构</figcaption>
            <canvas
              :ref="(el) => register(`${item.fixture.id}:structure`, el)"
              aria-label="兼顾局部结构的对照"
            />
            <small class="mono"
              >{{ percent(item.structure.inkError) }} /
              {{ percent(item.structure.structureError) }}</small
            >
          </figure>
        </div>
      </article>
    </div>
  </section>
</template>
