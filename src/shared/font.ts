/** Shared vocabulary for the glyph calibration bench. */

/** Coarse grid used to describe where ink sits inside one character cell. */
export const STRUCT_GRID = 3;
export const STRUCT_SIZE = STRUCT_GRID * STRUCT_GRID;

export type CalibrationStatus = "idle" | "loading" | "measuring" | "ready" | "error";

/** A font binary that has been parsed *and* installed into the document. */
export interface LoadedFont {
  /** Monotonic per-session id. Two loads never share it. */
  id: string;
  /** Unique CSS family name that cannot collide with the previous load. */
  family: string;
  /** Human readable family + style. */
  name: string;
  postscriptName: string;
  format: string;
  unitsPerEm: number;
  /** Em fraction of a representative glyph advance (used by the text preview). */
  advanceEm: number;
  /** True when the sampled ASCII advances are all identical. */
  monospace: boolean;
  /** Code points that really exist in this font (no fallback, no .notdef). */
  supported: ReadonlySet<number>;
  /** Number of glyphs in the font (for the bench header). */
  glyphCount: number;
  /** Where it came from, e.g. a file name. */
  source: string;
}

/** Measured properties of one candidate character inside one character cell. */
export interface GlyphMetric {
  char: string;
  codePoint: number;
  /** Mean alpha coverage of the glyph inside the cell, 0..1, quantised. */
  ink: number;
  /** 3 × 3 ink distribution inside the cell, row-major, 0..1, quantised. */
  feature: number[];
}

/** Inputs that invalidate a calibration when they change. */
export interface CalibrationInputs {
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
  candidates: string[];
}

export interface Calibration {
  /** Monotonic commit id; lets UI know a new measurement landed. */
  revision: number;
  /** Identity of the measurement (font + size + cell + candidates). */
  key: string;
  fontId: string;
  fontName: string;
  family: string;
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
  advanceEm: number;
  /** Declared candidate order, including characters missing from the font. */
  candidates: string[];
  /** Measured glyphs, in declared candidate order, missing ones removed. */
  glyphs: GlyphMetric[];
  /** Characters that the font does not really provide. Never ranked. */
  missing: string[];
  createdAt: number;
}
