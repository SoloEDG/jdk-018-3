import type { InjectionKey, Ref } from "vue";
import type { StudioDocument } from "./document";
import type { CalibrationStore } from "../features/calibration/model/useCalibration";
export interface StudioContext {
  doc: StudioDocument;
  busy: Ref<boolean>;
  notice: Ref<string>;
  calibration: CalibrationStore;
  invalidate: () => void;
}
export const studioKey: InjectionKey<StudioContext> = Symbol("studio");
