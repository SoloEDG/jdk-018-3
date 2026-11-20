import { reactive, ref, provide, watch } from "vue";
import { createDocument } from "../shared/defaults";
import { studioKey } from "../shared/context";
import { generate } from "../features/mapping";
import { createCalibrationStore } from "../features/calibration/model/useCalibration";
export function useWorkspace() {
  const doc = reactive(createDocument());
  const busy = ref(false),
    notice = ref("所有处理均在你的浏览器中完成");
  const calibration = createCalibrationStore();
  let timer: ReturnType<typeof setTimeout>;
  let run = 0;
  // A monotonically increasing count of finished generations; test hook only.
  let completed = 0;

  function invalidate() {
    doc.revision++;
    busy.value = true;
    clearTimeout(timer);
    const ticket = ++run;
    timer = setTimeout(async () => {
      try {
        // A font, size, cell or candidate change re-measures the bench even
        // when the map still uses the preset order.
        await calibration.ensure(doc.settings);
        const grid = await generate(doc, calibration);
        if (ticket !== run) return;
        doc.grid = grid;
        completed++;
        if (calibration.state.status === "error" && calibration.state.error) {
          notice.value = calibration.state.error;
        }
      } catch (e) {
        notice.value = e instanceof Error ? e.message : "生成失败";
      } finally {
        if (ticket === run) busy.value = false;
      }
    }, 60);
  }

  // Cell metrics, density, mapping mode and charset all feed calibration.
  for (const key of [
    "columns",
    "charset",
    "custom",
    "fontSize",
    "cellWidth",
    "cellHeight",
    "mapping",
  ] as const) {
    watch(() => doc.settings[key], invalidate);
  }
  watch(() => doc.settings.background, invalidate);
  // A successful font load remeasures; regenerate so calibrated maps follow it.
  watch(
    () => calibration.state.font?.id,
    (id, previous) => {
      if (id && id !== previous) invalidate();
    },
  );
  provide(studioKey, { doc, busy, notice, calibration, invalidate });

  // Test / automation hook. Read-only snapshot plus the setters a harness needs
  // to drive the studio without simulating drags.
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__studio = {
      snapshot() {
        const grid = doc.grid;
        return {
          fontName: calibration.state.font?.name ?? null,
          fontId: calibration.state.font?.id ?? null,
          status: calibration.state.status,
          error: calibration.state.error,
          calibrationRevision: calibration.state.calibration?.revision ?? null,
          calibrationKey: calibration.state.calibration?.key ?? null,
          matches: calibration.matches(doc.settings),
          busy: busy.value,
          completed,
          gridRevision: grid?.revision ?? null,
          docRevision: doc.revision,
          missing: calibration.state.calibration?.missing ?? [],
          glyphs:
            calibration.state.calibration?.glyphs.map((g) => ({
              char: g.char,
              ink: g.ink,
              feature: g.feature,
            })) ?? [],
          grid: grid
            ? {
                columns: grid.columns,
                rows: grid.rows,
                fontSize: grid.fontSize,
                cellWidth: grid.cellWidth,
                cellHeight: grid.cellHeight,
                mapping: grid.mapping,
                monospace: grid.monospace,
                revision: grid.revision,
                cells: grid.cells.map((c) => c.glyph).join(""),
              }
            : null,
          glyphStream: grid ? grid.cells.map((c) => c.glyph).join("\u0001") : null,
        };
      },
      setFontSize(v: number) {
        doc.settings.fontSize = v;
      },
      setCell(w: number, h: number) {
        doc.settings.cellWidth = w;
        doc.settings.cellHeight = h;
      },
      setMapping(mode: "preset" | "ink" | "structure") {
        doc.settings.mapping = mode;
      },
      setCharset(id: string, custom?: string) {
        doc.settings.charset = id;
        if (custom != null) doc.settings.custom = custom;
      },
      regenerate() {
        invalidate();
      },
      /** Deterministic probe: which glyph a flat cell of this tone selects. */
      probePick(ink: number, mode: "ink" | "structure") {
        const picker = calibration.picker(mode);
        if (!picker) return null;
        const glyph = picker.pick(ink, new Array(9).fill(ink));
        return glyph?.char ?? null;
      },
    };
  }
  return { doc, busy, notice, calibration, invalidate };
}
