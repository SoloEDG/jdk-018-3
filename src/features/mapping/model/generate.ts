import type { StudioDocument, Grid } from "../../../shared/document";
import type { CalibrationStore } from "../../calibration/model/useCalibration";
import type { Settings } from "../../../shared/document";
import { glyphs } from "../lib/charsets";
import { cellMetrics } from "../../../shared/cell";
import { gridSize } from "../lib/gridSize";
import { sample, composeCells, finishGrid } from "../lib/compose";

/**
 * Build the ASCII grid from the current document and calibration.
 *
 * Calibrated modes (`ink` / `structure`) refuse to render with a stale
 * calibration: the caller must `await calibration.ensure(settings)` first,
 * which guarantees the font is loaded and the glyphs measured.
 */
export async function generate(
  doc: StudioDocument,
  calibration: CalibrationStore,
): Promise<Grid | null> {
  if (!doc.asset) return null;
  const s = doc.settings;
  const metrics = cellMetrics(s);
  const font = calibration.state.font;
  const family = font?.family;
  // Preset order also honours real coverage: a character the loaded font does
  // not provide is dropped rather than silently drawn with a fallback face.
  const declared = glyphs(s.charset, s.custom);
  const presetChars = font
    ? declared.filter((ch) => font.supported.has(ch.codePointAt(0)!))
    : declared;
  if (!presetChars.length) {
    throw new Error("当前字体不包含任何候选字形");
  }
  const mode = s.mapping;

  let picker = null as ReturnType<CalibrationStore["picker"]> | null;
  if (mode === "ink" || mode === "structure") {
    if (!family) {
      throw new Error("请先加载等宽字体并完成字形标定");
    }
    await calibration.ensure(s);
    const cal = calibration.state.calibration;
    if (!cal || !calibration.matches(s)) {
      throw new Error(
        calibration.state.error ||
          "字形标定尚未完成，暂时无法按测量结果生成",
      );
    }
    picker = calibration.picker(mode);
    if (!picker) {
      throw new Error("标定结果为空：候选中没有任何可用字形");
    }
  }

  const size = gridSize(
    doc.asset.width * doc.crop.width,
    doc.asset.height * doc.crop.height,
    s.columns,
    metrics.cellWidth,
    metrics.cellHeight,
  );
  const sampled = sample(doc.asset, doc.crop, size.columns, size.rows, s.background);
  const options = {
    settings: s satisfies Settings,
    metrics,
    family: family ?? "monospace",
    advanceEm: calibration.state.font?.advanceEm ?? 0.6,
    monospace: calibration.state.font?.monospace ?? true,
    picker,
    presetChars,
  };
  const cells = composeCells(sampled, options);
  return finishGrid(sampled, cells, options, doc.revision);
}
