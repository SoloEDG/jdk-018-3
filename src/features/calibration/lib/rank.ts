import type { Calibration, GlyphMetric } from "../../../shared/font";

export type RankedMode = "ink" | "structure";

/**
 * Ink slack used by the structure tendency. Glyphs whose mean coverage is within
 * this tolerance of the best match become candidates, and local structure picks
 * among them. Keeping the slack small guarantees the map stays as bright/dark
 * as the picture; it only chooses *which* shape makes that coverage.
 */
export const STRUCTURE_SLACK = 0.012;
const EPSILON = 1e-9;
const BLANK = 0.008;

export interface Target {
  /** Desired mean coverage, 0..1, in the calibrated font's own range. */
  ink: number;
  /** Desired 3 × 3 coverage distribution, row-major, 0..1. */
  feature: number[];
}

export interface InkRange {
  min: number;
  max: number;
}

export interface RankedGlyph extends GlyphMetric {
  /** Position in the declared candidate order. Used for stable ties. */
  order: number;
}

/** Coverage span a font can actually reach. Targets are mapped into it. */
export function inkRange(glyphs: GlyphMetric[]): InkRange {
  if (!glyphs.length) return { min: 0, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const glyph of glyphs) {
    min = Math.min(min, glyph.ink);
    max = Math.max(max, glyph.ink);
  }
  if (!(max > min)) return { min, max: min + 1e-6 };
  return { min, max };
}

/** Map an image tone (0..1) onto the font's achievable coverage span. */
export function mapInk(tone: number, range: InkRange): number {
  const t = Math.max(0, Math.min(1, tone));
  return range.min + t * (range.max - range.min);
}

function pattern(feature: number[]): number[] | null {
  if (feature.length === 0) return null;
  const total = feature.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (total <= 1e-9) return null;
  return feature.map((v) => Math.max(0, v) / total);
}

/**
 * Total-variation distance (0..1) between two ink *distributions*. Both sides
 * are normalised by their own total, so a thin bright line matches a thin glyph
 * at any darkness while a blob still scores badly against a line.
 */
export function structureDistance(a: number[], b: number[]): number {
  const pa = pattern(a);
  const pb = pattern(b);
  if (!pa && !pb) return 0;
  if (!pa || !pb) return 1;
  const n = Math.min(pa.length, pb.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(pa[i]! - pb[i]!);
  return Math.min(1, sum / 2);
}

/** Ink error drives the mean-only tendency. Lower is better. */
export function inkError(glyph: GlyphMetric, target: Target): number {
  return Math.abs(glyph.ink - target.ink);
}

/** Deterministic order: declared order, then code point. Never random. */
export function stableSort(glyphs: GlyphMetric[], candidates: string[]): RankedGlyph[] {
  const order = new Map<string, number>();
  candidates.forEach((char, i) => {
    if (!order.has(char)) order.set(char, i);
  });
  return glyphs
    .map((g) => ({ ...g, order: order.get(g.char) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.order - b.order || a.codePoint - b.codePoint);
}

function byOrder(a: RankedGlyph, b: RankedGlyph): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.codePoint - b.codePoint;
}

/** Compare floating scores with an epsilon so exact ties stay exact. */
function cmp(a: number, b: number): number {
  return Math.abs(a - b) > EPSILON ? a - b : 0;
}

/**
 * Choose the best glyph deterministically.
 *
 * - `ink`: minimise mean coverage error, ties go to the declared order.
 * - `structure`: keep every glyph whose coverage is within
 *   {@link STRUCTURE_SLACK} of the best, then choose the closest 3 × 3 shape;
 *   remaining ties fall back to ink error, then declared order.
 */
export function pickGlyph(
  ranked: RankedGlyph[],
  target: Target,
  mode: RankedMode,
): RankedGlyph | null {
  if (!ranked.length) return null;
  let bestInk = Infinity;
  for (const glyph of ranked) {
    bestInk = Math.min(bestInk, inkError(glyph, target));
  }
  if (mode === "ink") {
    let best: RankedGlyph | null = null;
    let bestScore = Infinity;
    for (const glyph of ranked) {
      const s = inkError(glyph, target);
      if (!best) {
        best = glyph;
        bestScore = s;
      } else {
        const c = cmp(s, bestScore) || byOrder(glyph, best);
        if (c < 0) {
          best = glyph;
          bestScore = s;
        }
      }
    }
    return best;
  }

  const threshold = bestInk + STRUCTURE_SLACK;
  let best: RankedGlyph | null = null;
  let bestStructure = Infinity;
  let bestInkError = Infinity;
  for (const glyph of ranked) {
    const ie = inkError(glyph, target);
    if (ie > threshold + EPSILON) continue;
    const sd = structureDistance(glyph.feature, target.feature);
    if (!best) {
      best = glyph;
      bestStructure = sd;
      bestInkError = ie;
      continue;
    }
    const c =
      cmp(sd, bestStructure) || cmp(ie, bestInkError) || byOrder(glyph, best);
    if (c < 0) {
      best = glyph;
      bestStructure = sd;
      bestInkError = ie;
    }
  }
  return best;
}

function fill(value: number): number[] {
  return new Array(9).fill(value);
}

/**
 * Repeatedly pick the best glyph for progressively brighter image tones to
 * build a monotone ladder for visual comparison. Targets are mapped into the
 * font's achievable coverage range, exactly like the live picker.
 */
export function buildLadder(
  ranked: RankedGlyph[],
  mode: RankedMode,
  steps = 24,
): RankedGlyph[] {
  const range = inkRange(ranked);
  const ladder: RankedGlyph[] = [];
  for (let i = 0; i < steps; i++) {
    const tone = steps === 1 ? 0.5 : i / (steps - 1);
    const ink = mapInk(tone, range);
    const glyph = pickGlyph(ranked, { ink, feature: fill(ink) }, mode);
    if (glyph) ladder.push(glyph);
  }
  return ladder;
}

/** Precompute the ranking wrapper for a calibration (once per measurement). */
export function rankCalibration(cal: Calibration): RankedGlyph[] {
  return stableSort(cal.glyphs, cal.candidates);
}

/**
 * Build a deterministic cell picker for one measured tendency. The image tone
 * is mapped into the font's coverage range first, and results are cached on a
 * quantised target so equal inputs always return the same glyph.
 */
export function createPicker(
  cal: Calibration,
  mode: RankedMode,
): { mode: RankedMode; pick: (ink: number, feature: number[]) => RankedGlyph | null } {
  const ranked = stableSort(cal.glyphs, cal.candidates);
  const range = inkRange(ranked);
  const cache = new Map<string, RankedGlyph | null>();
  const featureLength = ranked[0]?.feature.length ?? 0;

  // A string key avoids the precision loss of packing 9 dims into a float:
  // 256 × 32⁹ exceeds Number.MAX_SAFE_INTEGER.
  function key(ink: number, feature: number[]): string {
    const parts = [Math.round(Math.max(0, Math.min(1, ink)) * 255)];
    for (let f = 0; f < featureLength; f++) {
      parts.push(Math.round(Math.max(0, Math.min(1, feature[f] ?? 0)) * 31));
    }
    return parts.join(",");
  }

  return {
    mode,
    pick(ink, feature) {
      const k = key(ink, feature);
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      const targetInk = mapInk(ink, range);
      const scale = ink > BLANK ? targetInk / ink : 0;
      const targetFeature =
        featureLength === 9 ? feature.map((v) => v * scale) : fill(targetInk);
      const glyph = pickGlyph(ranked, { ink: targetInk, feature: targetFeature }, mode);
      if (cache.size < 100000) cache.set(k, glyph);
      return glyph;
    },
  };
}
