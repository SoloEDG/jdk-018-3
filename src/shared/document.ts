export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Asset {
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}
/** How a cell's tone is turned into a glyph. */
export type MappingMode = "preset" | "ink" | "structure";
export interface Settings {
  columns: number;
  charset: string;
  custom: string;
  contrast: number;
  gamma: number;
  invert: boolean;
  color: boolean;
  background: string;
  /** Glyph size in CSS pixels. Calibration is measured at this size. */
  fontSize: number;
  /** Character cell width in CSS pixels. */
  cellWidth: number;
  /** Character cell height in CSS pixels. */
  cellHeight: number;
  mapping: MappingMode;
}
export interface Cell {
  glyph: string;
  color: string;
}
export interface Grid {
  columns: number;
  rows: number;
  cells: Cell[];
  revision: number;
  /** Cell metrics and typeface used by the preview and every exporter. */
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fontFamily: string;
  /** Advance width of one character, as a fraction of the em. */
  advanceEm: number;
  /** Whether the typeface advances every glyph identically. */
  monospace: boolean;
  mapping: MappingMode;
}
export interface StudioDocument {
  asset: Asset | null;
  crop: Crop;
  settings: Settings;
  grid: Grid | null;
  revision: number;
}
