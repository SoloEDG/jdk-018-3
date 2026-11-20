<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Grid } from "../../../shared/document";
import type { Calibration, CalibrationStatus } from "../../../shared/font";
import { cssFont } from "../../../shared/cell";
import { glyphLabel } from "../../mapping/lib/charsets";
import type { CalibrationStore } from "../model/useCalibration";
import { buildLadder, rankCalibration, type RankedGlyph } from "../lib/rank";

const props = defineProps<{
  calibration: CalibrationStore;
  grid: Grid | null;
  status: CalibrationStatus;
  /** Keyboard / a11y label for the strip. */
  label?: string;
}>();

/** Which tendency the bench is currently showing side by side. */
const tendency = ref<"ink" | "structure">("structure");
const showMissing = ref(false);

const font = computed(() => props.calibration.state.font);
const activeCalibration = computed<Calibration | null>(
  () => props.calibration.state.calibration,
);
const ranked = computed<RankedGlyph[]>(() =>
  activeCalibration.value ? rankCalibration(activeCalibration.value) : [],
);
const missing = computed(() => activeCalibration.value?.missing ?? []);

/** Side-by-side ladders: mean ink only, then mean ink + local structure. */
const ladders = computed(() => ({
  ink: ranked.value.length ? buildLadder(ranked.value, "ink") : [],
  structure: ranked.value.length ? buildLadder(ranked.value, "structure") : [],
}));

/** Which measured glyphs the *current* map actually used, by frequency. */
const usage = computed(() => {
  const counts = new Map<string, number>();
  const grid = props.grid;
  if (!grid) return [] as (RankedGlyph & { count: number })[];
  for (const cell of grid.cells) {
    counts.set(cell.glyph, (counts.get(cell.glyph) ?? 0) + 1);
  }
  return ranked.value
    .filter((g) => counts.has(g.char))
    .map((g) => ({ ...g, count: counts.get(g.char) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.order - b.order);
});

const usageTotal = computed(() => props.grid?.cells.length ?? 0);

/** The coverage table also exposes every measured candidate. */
const table = computed(() =>
  [...ranked.value].sort((a, b) => a.ink - b.ink || a.order - b.order),
);

function preview(glyph: RankedGlyph) {
  return glyph.char;
}

/** One canvas previews a whole ladder at the calibrated cell size. */
const ladderCanvas = ref<HTMLCanvasElement | null>(null);
const ladderWidth = computed(() => {
  const cal = activeCalibration.value;
  return cal ? Math.max(1, Math.round(cal.cellWidth)) : 8;
});
const ladderHeight = computed(() => {
  const cal = activeCalibration.value;
  return cal ? Math.max(1, Math.round(cal.cellHeight)) : 16;
});

function drawLadder() {
  const canvas = ladderCanvas.value;
  const cal = activeCalibration.value;
  if (!canvas || !cal) return;
  const pool = tendency.value === "ink" ? ladders.value.ink : ladders.value.structure;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const cw = ladderWidth.value;
  const ch = ladderHeight.value;
  canvas.width = Math.max(1, pool.length * cw * dpr);
  canvas.height = Math.max(1, ch * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(dpr, dpr);
  g.fillStyle = "#11131a";
  g.fillRect(0, 0, pool.length * cw, ch);
  g.font = cssFont(cal.fontSize, cal.family);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#e6ecd8";
  pool.forEach((glyph, i) => {
    g.fillText(glyph.char, i * cw + cw / 2, ch / 2);
  });
}

watch(
  () => [tendency.value, activeCalibration.value?.revision, ladders.value],
  drawLadder,
  { flush: "post" },
);
onMounted(drawLadder);
onBeforeUnmount(() => {
  ladderCanvas.value = null;
});

/**
 * Preview cards: each candidate rendered at the calibrated size *and* cell, so
 * changing font size / cell / font is immediately visible.
 */
const previewStyle = computed(() => {
  const cal = activeCalibration.value;
  if (!cal) return {};
  return {
    width: `${cal.cellWidth}px`,
    height: `${cal.cellHeight}px`,
    fontFamily: `'${cal.family}', monospace`,
    fontSize: `${cal.fontSize}px`,
    lineHeight: `${cal.cellHeight}px`,
  };
});

function inkPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
</script>

<template>
  <div class="calibration">
    <div class="cal-status" role="status" data-testid="calibration-status">
      <template v-if="font">
        <span class="font-name" data-testid="calibration-font">{{ font.name }}</span>
        <span class="font-meta mono"
          >{{ font.format }} · {{ font.glyphCount }} 字形 ·
          {{ font.monospace ? "等宽" : "比例" }}</span
        >
      </template>
      <span v-else class="muted">尚未加载字体</span>
      <span class="cal-badge" :data-state="status">
        {{
          status === "loading"
            ? "加载中"
            : status === "measuring"
              ? "测量中"
              : status === "ready"
                ? "已标定"
                : status === "error"
                  ? "错误"
                  : "待标定"
        }}
      </span>
    </div>

    <div v-if="activeCalibration" class="cal-meta mono" data-testid="calibration-shape">
      {{ activeCalibration.cellWidth }}×{{ activeCalibration.cellHeight }} px 字符框 ·
      字号 {{ activeCalibration.fontSize }} px · {{ activeCalibration.glyphs.length }}/{{
        activeCalibration.candidates.length
      }}
      字形可用
    </div>

    <div v-if="missing.length" class="cal-warning" data-testid="calibration-missing">
      <span>缺失字形不参与排序：</span>
      <span
        v-for="char in showMissing ? missing : missing.slice(0, 8)"
        :key="char"
        class="missing-chip mono"
        :title="`U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`"
        >{{ glyphLabel(char) }}</span
      >
      <button
        v-if="missing.length > 8"
        type="button"
        class="link-button"
        @click="showMissing = !showMissing"
      >
        {{ showMissing ? "收起" : `+${missing.length - 8}` }}
      </button>
    </div>

    <template v-if="activeCalibration && ranked.length">
      <div class="bench-tabs" role="tablist" aria-label="选字倾向">
        <button
          type="button"
          role="tab"
          :aria-selected="tendency === 'ink'"
          :class="{ active: tendency === 'ink' }"
          @click="tendency = 'ink'"
        >
          只看平均墨色
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tendency === 'structure'"
          :class="{ active: tendency === 'structure' }"
          @click="tendency = 'structure'"
        >
          兼顾局部结构
        </button>
      </div>

      <div class="ladder-wrap">
        <canvas
          ref="ladderCanvas"
          class="ladder-canvas"
          aria-label="单调明暗阶梯预览"
          :style="{
            width: `${(tendency === 'ink' ? ladders.ink.length : ladders.structure.length) * ladderWidth}px`,
            height: `${ladderHeight}px`,
          }"
        />
      </div>

      <div class="tendency-compare">
        <div class="tendency-col">
          <h4>只看平均墨色</h4>
          <div class="tendency-strip">
            <span
              v-for="(g, i) in ladders.ink"
              :key="`ink-${i}`"
              class="tendency-glyph"
              :style="previewStyle"
              >{{ preview(g) }}</span
            >
          </div>
        </div>
        <div class="tendency-col">
          <h4>兼顾局部结构</h4>
          <div class="tendency-strip">
            <span
              v-for="(g, i) in ladders.structure"
              :key="`st-${i}`"
              class="tendency-glyph"
              :style="previewStyle"
              >{{ preview(g) }}</span
            >
          </div>
        </div>
      </div>

      <div v-if="usageTotal" class="usage" data-testid="calibration-usage">
        <div class="usage-title mono">
          当前映射使用 · {{ usageTotal.toLocaleString() }} 格
        </div>
        <div class="usage-strip">
          <span
            v-for="g in usage.slice(0, 16)"
            :key="`u-${g.char}`"
            class="usage-glyph"
            :style="previewStyle"
            :title="`${glyphLabel(g.char)} · ${inkPercent(g.ink)} · ${g.count} 格`"
            >{{ g.char }}</span
          >
        </div>
      </div>

      <details class="cal-table">
        <summary>覆盖率明细（{{ table.length }} 个字形）</summary>
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>字形</th>
                <th>码位</th>
                <th>覆盖率</th>
                <th>局部墨色</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in table" :key="g.char">
                <td>
                  <span class="table-glyph" :style="previewStyle">{{ g.char }}</span>
                </td>
                <td class="mono">
                  U+{{ g.codePoint.toString(16).toUpperCase().padStart(4, "0") }}
                </td>
                <td class="mono">{{ inkPercent(g.ink) }}</td>
                <td class="mono feature">
                  <span
                    v-for="(v, i) in g.feature"
                    :key="i"
                    class="feature-cell"
                    :style="{ background: `rgba(200, 223, 145, ${v.toFixed(3)})` }"
                    :title="v.toFixed(3)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>

    <div v-else-if="font && status === 'ready'" class="hint">
      还没有可用候选字形。
    </div>
  </div>
</template>
