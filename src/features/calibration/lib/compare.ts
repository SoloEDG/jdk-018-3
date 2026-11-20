import type { Settings } from "../../../shared/document";
import type { Calibration, GlyphMetric } from "../../../shared/font";
import type { CellMetrics } from "../../../shared/cell";
import {
  cellTarget,
  composeCells,
  finishGrid,
  sampleSource,
  type Sampled,
} from "../../mapping/lib/compose";
import { createPicker, inkRange, mapInk, structureDistance } from "./rank";
import { fixtures, fixtureColumns, type Fixture } from "./fixtures";
import type { Grid } from "../../../shared/document";

export interface CompareSide {
  grid: Grid;
  /** Mean absolute coverage error against the font-mapped target tone. */
  inkError: number;
  /** Mean normalised 3 × 3 structure error. */
  structureError: number;
}

export interface CompareFixture {
  fixture: Fixture;
  sampled: Sampled;
  ink: CompareSide;
  structure: CompareSide;
}

function meanErrors(
  grid: Grid,
  sampled: Sampled,
  byChar: Map<string, GlyphMetric>,
  settings: Settings,
  range: { min: number; max: number },
): { ink: number; structure: number } {
  let inkSum = 0;
  let structSum = 0;
  let count = 0;
  for (let row = 0; row < sampled.rows; row++) {
    for (let col = 0; col < sampled.columns; col++) {
      const cell = grid.cells[row * sampled.columns + col];
      if (!cell) continue;
      const glyph = byChar.get(cell.glyph);
      if (!glyph) continue;
      const target = cellTarget(sampled, col, row, settings);
      const targetInk = mapInk(target.ink, range);
      const scale = target.ink > 0.008 ? targetInk / target.ink : 0;
      const targetFeature = target.feature.map((v) => v * scale);
      inkSum += Math.abs(glyph.ink - targetInk);
      structSum += structureDistance(glyph.feature, targetFeature);
      count++;
    }
  }
  return count
    ? { ink: inkSum / count, structure: structSum / count }
    : { ink: 0, structure: 0 };
}

/**
 * Render both tendencies over the line-art and gradient fixtures with the
 * *same* sampled raster, so the only difference is the selection rule.
 */
export function compareFixtures(
  calibration: Calibration,
  settings: Settings,
  metrics: CellMetrics,
  family: string,
  monospace: boolean,
): CompareFixture[] {
  const byChar = new Map(calibration.glyphs.map((g) => [g.char, g]));
  const range = inkRange(calibration.glyphs);
  const pickers = {
    ink: createPicker(calibration, "ink"),
    structure: createPicker(calibration, "structure"),
  };
  const base = {
    settings,
    metrics,
    family,
    advanceEm: calibration.advanceEm,
    monospace,
    presetChars: [],
  };

  return fixtures().map((fixture) => {
    const { columns, rows } = fixtureColumns(metrics);
    const sampled = sampleSource(
      {
        source: fixture.canvas,
        x: 0,
        y: 0,
        width: fixture.canvas.width,
        height: fixture.canvas.height,
      },
      columns,
      rows,
      "#05070a",
    );
    const sides = {} as Record<"ink" | "structure", CompareSide>;
    for (const mode of ["ink", "structure"] as const) {
      const options = { ...base, picker: pickers[mode] };
      const grid = finishGrid(sampled, composeCells(sampled, options), options, 0);
      const errors = meanErrors(grid, sampled, byChar, settings, range);
      sides[mode] = { grid, inkError: errors.ink, structureError: errors.structure };
    }
    return { fixture, sampled, ink: sides.ink, structure: sides.structure };
  });
}
