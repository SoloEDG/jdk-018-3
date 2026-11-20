import { STRUCT_GRID, STRUCT_SIZE, type GlyphMetric } from "../../../shared/font";
import { cssFont, type CellMetrics } from "../../../shared/cell";
import type { Font } from "fontkit";

/** Supersampling factor used while measuring a glyph inside one character cell. */
export const SUPERSAMPLE = 4;
const QUANT = 10000;

function quantize(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * QUANT) / QUANT;
}

export interface MeasureResult {
  glyphs: GlyphMetric[];
  /** Characters the font does not really provide. Never ranked. */
  missing: string[];
}

function isBlank(char: string): boolean {
  return /^\s$/.test(char) || char.codePointAt(0) === 0xa0;
}

/**
 * Measure every candidate with the installed font at the same size, cell and
 * baseline as the preview. Characters absent from the font, or silently
 * replaced by a fallback face, are reported as missing instead of measured.
 */
export function measureGlyphs(
  font: Font,
  candidates: string[],
  metrics: CellMetrics,
  family: string,
): MeasureResult {
  if (typeof document === "undefined") {
    throw new Error("需要在浏览器中测量字形");
  }
  const { fontSize, cellWidth, cellHeight } = metrics;
  const W = Math.max(1, Math.round(cellWidth * SUPERSAMPLE));
  const H = Math.max(1, Math.round(cellHeight * SUPERSAMPLE));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("当前浏览器无法创建 2D 画布");

  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("当前浏览器无法创建 2D 画布");

  const fontCss = cssFont(fontSize, family);
  const fontCssNoFallback = `${fontSize}px "${family.replace(/["\\]/g, "")}"`;

  // Pixel counts per structural region, so non-divisible sizes still normalise.
  const regionCount = new Array(STRUCT_SIZE).fill(0);
  for (let y = 0; y < H; y++) {
    const ry = Math.min(STRUCT_GRID - 1, Math.floor((y * STRUCT_GRID) / H));
    for (let x = 0; x < W; x++) {
      const rx = Math.min(STRUCT_GRID - 1, Math.floor((x * STRUCT_GRID) / W));
      regionCount[ry * STRUCT_GRID + rx]++;
    }
  }

  const glyphs: GlyphMetric[] = [];
  const missing: string[] = [];

  for (const char of candidates) {
    const codePoint = char.codePointAt(0);
    if (codePoint == null) continue;

    let glyphId = 0;
    let advance = 0;
    try {
      const glyph = font.glyphForCodePoint(codePoint);
      glyphId = glyph?.id ?? 0;
      advance = glyph?.advanceWidth ?? 0;
    } catch {
      glyphId = 0;
    }
    if (glyphId === 0 || !font.hasGlyphForCodePoint(codePoint)) {
      missing.push(char);
      continue;
    }

    // A fallback face reports a different advance: reject it instead of
    // letting a substituted glyph take part in the ranking.
    if (!isBlank(char) && advance > 0) {
      const expected = (advance / font.unitsPerEm) * fontSize;
      probe.font = fontCssNoFallback;
      const measured = probe.measureText(char).width;
      const tolerance = Math.max(0.75, fontSize * 0.08, expected * 0.06);
      if (Math.abs(measured - expected) > tolerance) {
        missing.push(char);
        continue;
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(SUPERSAMPLE, 0, 0, SUPERSAMPLE, 0, 0);
    ctx.font = fontCss;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(char, cellWidth / 2, cellHeight / 2);

    const data = ctx.getImageData(0, 0, W, H).data;
    const region = new Array(STRUCT_SIZE).fill(0);
    let total = 0;
    for (let y = 0; y < H; y++) {
      const ry = Math.min(STRUCT_GRID - 1, Math.floor((y * STRUCT_GRID) / H));
      const row = y * W;
      for (let x = 0; x < W; x++) {
        const alpha = data[(row + x) * 4 + 3]!;
        if (!alpha) continue;
        total += alpha;
        const rx = Math.min(STRUCT_GRID - 1, Math.floor((x * STRUCT_GRID) / W));
        region[ry * STRUCT_GRID + rx] += alpha;
      }
    }

    const ink = quantize(total / (W * H * 255));
    const feature = region.map((sum, i) =>
      quantize(sum / (regionCount[i]! * 255)),
    );
    glyphs.push({ char, codePoint, ink, feature });
  }

  return { glyphs, missing };
}
