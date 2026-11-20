import { reactive } from "vue";
import type {
  Calibration,
  CalibrationInputs,
  CalibrationStatus,
  LoadedFont,
} from "../../../shared/font";
import type { Settings } from "../../../shared/document";
import { cellMetrics } from "../../../shared/cell";
import { glyphs } from "../../mapping/lib/charsets";
import { installFont, uninstallFont } from "../lib/loadFont";
import { measureGlyphs } from "../lib/measure";
import { rankCalibration, createPicker, type RankedGlyph } from "../lib/rank";
import type { GlyphPicker } from "../../mapping/lib/pick";
import type { Font } from "fontkit";

export const BUNDLED_FONT = {
  path: "fonts/DejaVuSansMono.woff2",
  name: "DejaVu Sans Mono",
} as const;

const FONT_TYPES = /\.(ttf|otf|woff2?|ttc)$/i;

export interface CalibrationState {
  status: CalibrationStatus;
  /** The last font that was successfully installed. Kept on later failures. */
  font: LoadedFont | null;
  /** The last successful measurement. Kept when a reload fails. */
  calibration: Calibration | null;
  /** Human readable failure of the most recent load attempt. */
  error: string;
  /** Source / label currently being parsed and installed. */
  pending: string;
}

export interface CalibrationStore {
  state: CalibrationState;
  candidates(settings: Settings): string[];
  /** A key describing the current calibration inputs (font + cell + candidates). */
  keyFor(settings: Settings): string;
  /** True when the current calibration matches these settings exactly. */
  matches(settings: Settings): boolean;
  /** Re-measure if anything changed. Awaits an in-flight font load. */
  ensure(settings: Settings): Promise<void>;
  ranked(): RankedGlyph[];
  picker(mode: "ink" | "structure"): GlyphPicker | null;
  loadFile(file: File): Promise<void>;
  loadBundled(): Promise<void>;
}

function inputsFor(settings: Settings, candidates: string[]): CalibrationInputs {
  const metrics = cellMetrics(settings);
  return { ...metrics, candidates };
}

function keyOf(fontId: string, inputs: CalibrationInputs): string {
  return [
    fontId,
    inputs.fontSize,
    inputs.cellWidth,
    inputs.cellHeight,
    inputs.candidates.join("\u0000"),
  ].join("|");
}

export function createCalibrationStore(): CalibrationStore {
  const state = reactive<CalibrationState>({
    status: "idle",
    font: null,
    calibration: null,
    error: "",
    pending: "",
  });

  let parsed: Font | null = null;
  let face: FontFace | null = null;
  let lastKey = "";
  let lastInputs: CalibrationInputs | null = null;
  let measureSeq = 0;
  let loadTicket = 0;
  let pendingLoad: Promise<void> | null = null;
  let pickerMemo: { key: string; value: GlyphPicker } | null = null;
  let rankedMemo: { key: string; value: RankedGlyph[] } | null = null;

  function candidates(settings: Settings): string[] {
    return glyphs(settings.charset, settings.custom);
  }

  function keyFor(settings: Settings): string {
    return keyOf(
      state.font?.id ?? "none",
      inputsFor(settings, candidates(settings)),
    );
  }

  function matches(settings: Settings): boolean {
    return !!state.calibration && lastKey === keyFor(settings);
  }

  function measureNow(inputs: CalibrationInputs): void {
    if (!parsed || !state.font) return;
    const key = keyOf(state.font.id, inputs);
    if (key === lastKey && state.calibration) return;
    state.status = "measuring";
    try {
      const result = measureGlyphs(
        parsed,
        inputs.candidates,
        inputs,
        state.font.family,
      );
      const calibration: Calibration = {
        revision: ++measureSeq,
        key,
        fontId: state.font.id,
        fontName: state.font.name,
        family: state.font.family,
        fontSize: inputs.fontSize,
        cellWidth: inputs.cellWidth,
        cellHeight: inputs.cellHeight,
        advanceEm: state.font.advanceEm,
        candidates: inputs.candidates,
        glyphs: result.glyphs,
        missing: result.missing,
        createdAt: Date.now(),
      };
      state.calibration = calibration;
      lastKey = key;
      state.status = "ready";
      state.error = "";
      pickerMemo = null;
      rankedMemo = null;
    } catch (e) {
      state.status = "error";
      state.error = e instanceof Error ? e.message : "字形测量失败";
      // Keep the previous measurement (and its key) so the bench and any
      // already-calibrated map remain displayable; `matches` will report a
      // mismatch for the new inputs, so generation asks for a retry.
    }
  }

  async function ensure(settings: Settings): Promise<void> {
    lastInputs = inputsFor(settings, candidates(settings));
    if (pendingLoad) await pendingLoad.catch(() => undefined);
    if (!parsed || !state.font) return;
    measureNow(lastInputs);
  }

  async function readFileBytes(source: File | string): Promise<{
    bytes: ArrayBuffer;
    fileName: string;
  }> {
    if (typeof source === "string") {
      let response: Response;
      try {
        response = await fetch(`${import.meta.env.BASE_URL}${source}`);
      } catch {
        throw new Error("内置字体无法下载，请检查网络或改用本地字体");
      }
      if (!response.ok) throw new Error(`内置字体读取失败（${response.status}）`);
      return {
        bytes: await response.arrayBuffer(),
        fileName: source.split("/").pop() ?? source,
      };
    }
    return { bytes: await source.arrayBuffer(), fileName: source.name };
  }

  async function load(source: File | string, label: string): Promise<void> {
    const ticket = ++loadTicket;
    state.status = "loading";
    state.pending = label;
    state.error = "";
    const promise = (async () => {
      try {
        const { bytes, fileName } = await readFileBytes(source);
        const installed = await installFont(
          bytes,
          fileName,
          FONT_TYPES.exec(fileName)?.[1] ?? "font",
        );
        if (ticket !== loadTicket) {
          // Superseded by a newer request: never install the stale face.
          uninstallFont(installed.face);
          return;
        }
        uninstallFont(face);
        face = installed.face;
        parsed = installed.parsed;
        state.font = installed.info;
        lastKey = "";
        pickerMemo = null;
        rankedMemo = null;
        state.status = "ready";
        if (lastInputs) measureNow(lastInputs);
      } catch (e) {
        if (ticket !== loadTicket) return;
        // Keep the previous font *and* its calibration untouched.
        state.status = "error";
        state.error = e instanceof Error ? e.message : "字体加载失败";
      } finally {
        if (ticket === loadTicket) state.pending = "";
      }
    })();
    pendingLoad = promise;
    try {
      await promise;
    } finally {
      if (pendingLoad === promise) pendingLoad = null;
    }
  }

  return {
    state,
    candidates,
    keyFor,
    matches,
    ensure,
    async loadFile(file: File) {
      if (!FONT_TYPES.test(file.name)) {
        state.error = "请选择 TTF、OTF、WOFF 或 WOFF2 字体文件";
        return;
      }
      if (file.size > 32 * 1024 * 1024) {
        state.error = "字体文件请控制在 32 MB 以内";
        return;
      }
      await load(file, file.name);
    },
    loadBundled() {
      return load(BUNDLED_FONT.path, BUNDLED_FONT.name);
    },
    ranked(): RankedGlyph[] {
      const cal = state.calibration;
      if (!cal) return [];
      const key = `${cal.revision}`;
      if (rankedMemo?.key !== key) {
        rankedMemo = { key, value: rankCalibration(cal) };
      }
      return rankedMemo.value;
    },
    picker(mode) {
      const cal = state.calibration;
      if (!cal || !cal.glyphs.length) return null;
      const key = `${cal.revision}:${mode}`;
      if (pickerMemo?.key !== key) {
        pickerMemo = { key, value: createPicker(cal, mode) };
      }
      return pickerMemo.value;
    },
  };
}
