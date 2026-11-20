import type { Grid } from "../../../shared/document";

export interface DrawOptions {
  color: boolean;
  /** Multiply every pixel dimension, for crisp previews and exports. */
  scale?: number;
}

/** Paint a grid with the exact metrics and typeface recorded on the grid. */
export function drawGrid(
  canvas: HTMLCanvasElement,
  grid: Grid,
  color: boolean,
  background: string,
  scale = 1,
) {
  const cellWidth = Math.max(1, grid.cellWidth);
  const cellHeight = Math.max(1, grid.cellHeight);
  canvas.width = Math.max(1, Math.round(grid.columns * cellWidth * scale));
  canvas.height = Math.max(1, Math.round(grid.rows * cellHeight * scale));
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = `${grid.fontSize * scale}px "${grid.fontFamily.replace(/["\\]/g, "")}", monospace`;
  g.textBaseline = "middle";
  g.textAlign = "center";
  const cw = cellWidth * scale;
  const ch = cellHeight * scale;
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i]!;
    g.fillStyle = color ? c.color : "#e9eceb";
    g.fillText(
      c.glyph,
      (i % grid.columns) * cw + cw / 2,
      Math.floor(i / grid.columns) * ch + ch / 2,
    );
  }
}
