export function gridSize(
  width: number,
  height: number,
  columns: number,
  cellWidth: number,
  cellHeight: number,
) {
  const n = Math.round(Math.max(30, Math.min(220, columns)));
  // Rows follow the real character cell aspect, not a hard-coded 1:2 ratio.
  const aspect = cellWidth > 0 ? cellHeight / cellWidth : 2;
  const rows = Math.max(1, Math.round((height / width) * n / aspect));
  if (!Number.isFinite(rows) || rows > 1200) {
    throw new Error("裁剪区域过于狭长，请缩小范围或降低字符密度");
  }
  return { columns: n, rows };
}
