export interface CellMetrics {
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
}

export const CELL_LIMITS = {
  fontSize: { min: 6, max: 96 },
  cellWidth: { min: 3, max: 72 },
  cellHeight: { min: 6, max: 108 },
} as const;

function clamp(value: number, min: number, max: number, fallback: number): number {
  const n = Math.round(Number.isFinite(value) ? value : fallback);
  return Math.max(min, Math.min(max, n));
}

/** Canonical, integer cell metrics. Measurement, sampling and rendering all use this. */
export function cellMetrics(source: {
  fontSize: number;
  cellWidth: number;
  cellHeight: number;
}): CellMetrics {
  return {
    fontSize: clamp(source.fontSize, CELL_LIMITS.fontSize.min, CELL_LIMITS.fontSize.max, 14),
    cellWidth: clamp(source.cellWidth, CELL_LIMITS.cellWidth.min, CELL_LIMITS.cellWidth.max, 8),
    cellHeight: clamp(source.cellHeight, CELL_LIMITS.cellHeight.min, CELL_LIMITS.cellHeight.max, 16),
  };
}

export function cssFont(fontSize: number, family: string): string {
  const safe = family.replace(/["\\]/g, "");
  return `${fontSize}px "${safe}", monospace`;
}
