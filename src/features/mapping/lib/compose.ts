import type { Asset, Crop, Grid, Cell, Settings } from "../../../shared/document";
import type { CellMetrics } from "../../../shared/cell";
import { tone, luminance } from "./tone";
import type { GlyphPicker } from "./pick";

/** Each image cell is sampled at 3 × 3 to describe its local structure. */
export const SUB = 3;

export interface Sampled {
  columns: number;
  rows: number;
  /** RGBA at (columns * SUB) × (rows * SUB). */
  data: Uint8ClampedArray;
  /** Raw average colour per cell, `#rrggbb`. */
  colors: string[];
}

export interface SampleSource {
  source: CanvasImageSource;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rasterise one source region into a 3 × 3-per-cell RGBA buffer. */
export function sampleSource(
  source: SampleSource,
  columns: number,
  rows: number,
  background: string,
): Sampled {
  const width = columns * SUB;
  const height = rows * SUB;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) throw new Error("当前浏览器无法创建 2D 画布");
  g.fillStyle = background;
  g.fillRect(0, 0, width, height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(
    source.source,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    width,
    height,
  );
  const data = g.getImageData(0, 0, width, height).data;

  const colors: string[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      let r = 0;
      let gr = 0;
      let b = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const i = (((row * SUB + sy) * width) + col * SUB + sx) * 4;
          r += data[i]!;
          gr += data[i + 1]!;
          b += data[i + 2]!;
        }
      }
      const n = SUB * SUB;
      colors.push(
        "#" +
          [r / n, gr / n, b / n]
            .map((v) => Math.round(v).toString(16).padStart(2, "0"))
            .join(""),
      );
    }
  }
  return { columns, rows, data, colors };
}

export function sample(
  asset: Asset,
  crop: Crop,
  columns: number,
  rows: number,
  background: string,
): Sampled {
  return sampleSource(
    {
      source: asset.image,
      x: crop.x * asset.width,
      y: crop.y * asset.height,
      width: crop.width * asset.width,
      height: crop.height * asset.height,
    },
    columns,
    rows,
    background,
  );
}

export interface ComposeOptions {
  settings: Settings;
  metrics: CellMetrics;
  family: string;
  advanceEm: number;
  monospace: boolean;
  /** Calibrated glyphs; `null` means use the declared preset order. */
  picker: GlyphPicker | null;
  presetChars: string[];
}

export interface CellTarget {
  /** Mean tone of the cell, 0..1. */
  ink: number;
  /** 3 × 3 tone distribution, row-major. */
  feature: number[];
}

/** Read a single cell's mean tone and local 3 × 3 structure. */
export function cellTarget(
  sampled: Sampled,
  col: number,
  row: number,
  settings: Pick<Settings, "contrast" | "gamma" | "invert">,
): CellTarget {
  const width = sampled.columns * SUB;
  const feature: number[] = [];
  let sum = 0;
  for (let sy = 0; sy < SUB; sy++) {
    const y = row * SUB + sy;
    for (let sx = 0; sx < SUB; sx++) {
      const x = col * SUB + sx;
      const i = (y * width + x) * 4;
      const t = tone(
        luminance(sampled.data[i]!, sampled.data[i + 1]!, sampled.data[i + 2]!),
        settings.contrast,
        settings.gamma,
        settings.invert,
      );
      feature.push(t);
      sum += t;
    }
  }
  return { ink: sum / feature.length, feature };
}

/**
 * Turn a sampled raster into cells. When a picker is supplied every cell is
 * ranked from its mean tone *and* its 3 × 3 structure; otherwise the legacy
 * declared-order preset is used.
 */
export function composeCells(sampled: Sampled, options: ComposeOptions): Cell[] {
  const { settings, picker, presetChars } = options;
  const cells: Cell[] = [];

  for (let row = 0; row < sampled.rows; row++) {
    for (let col = 0; col < sampled.columns; col++) {
      const { ink, feature } = cellTarget(sampled, col, row, settings);
      const glyph = picker
        ? (picker.pick(ink, feature)?.char ?? presetChars[0] ?? " ")
        : (presetChars[
            Math.max(
              0,
              Math.min(
                presetChars.length - 1,
                Math.round(ink * (presetChars.length - 1)),
              ),
            )
          ] ?? " ");
      cells.push({
        glyph,
        color: sampled.colors[row * sampled.columns + col] ?? "#ffffff",
      });
    }
  }
  return cells;
}

export function finishGrid(
  sampled: Sampled,
  cells: Cell[],
  options: ComposeOptions,
  revision: number,
): Grid {
  return {
    columns: sampled.columns,
    rows: sampled.rows,
    cells,
    revision,
    cellWidth: options.metrics.cellWidth,
    cellHeight: options.metrics.cellHeight,
    fontSize: options.metrics.fontSize,
    fontFamily: options.family,
    advanceEm: options.advanceEm,
    monospace: options.monospace,
    mapping: options.picker ? options.picker.mode : "preset",
  };
}