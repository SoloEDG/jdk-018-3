import type { GlyphMetric } from "../../../shared/font";
import type { MappingMode } from "../../../shared/document";

export interface GlyphPicker {
  mode: Exclude<MappingMode, "preset">;
  /** Deterministically choose a glyph for a cell's mean tone and 3 × 3 tones. */
  pick(ink: number, feature: number[]): GlyphMetric | null;
}
