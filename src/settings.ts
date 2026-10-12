import type { Camera } from "./recordings";

export interface Settings {
  /** Merge recordings separated by at most this many seconds (0 = only seamless 5-minute rollovers). */
  mergeGap: number;
  startCamera: Camera;
  /** Continue into the next (newer) event when one finishes. */
  autoAdvance: boolean;
  clock24: boolean;
}

const KEY = "svr-viewer-settings";
const DEFAULTS: Settings = { mergeGap: 0, startCamera: "FRONT", autoAdvance: false, clock24: false };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
