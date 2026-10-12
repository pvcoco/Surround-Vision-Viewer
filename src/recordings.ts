// Parsing of Surround Vision Recorder file names and grouping into events.
//
// Files look like FRONT_2026_10_12_T_15_44_52.mp4: one file per camera per segment,
// where the timestamp is the local start time. The recorder rolls over every 5 minutes.

export type Camera = "FRONT" | "REAR" | "LEFT" | "RIGHT" | "CABIN";
export const CAMERAS: Camera[] = ["FRONT", "REAR", "LEFT", "RIGHT", "CABIN"];
export const SURROUND: Camera[] = ["FRONT", "REAR", "LEFT", "RIGHT"];

/** Abstract handle to one recording file, independent of where it came from. */
export interface RecFile {
  name: string;
  size: number;
  /** URL usable as a <video> src. */
  url(): Promise<string>;
  /** Reads bytes [start, end). */
  read(start: number, end: number): Promise<ArrayBuffer>;
}

export interface Segment {
  key: string;
  start: Date;
  /** Seconds; filled in after probing the MP4. */
  duration: number;
  files: Partial<Record<Camera, RecFile>>;
}

export interface RecEvent {
  id: string;
  start: Date;
  segments: Segment[];
  /** Offset (seconds) of each segment within the event timeline. */
  offsets: number[];
  duration: number;
}

const NAME_RE = /^([A-Za-z]+)_(\d{4})_(\d{2})_(\d{2})_T_(\d{2})_(\d{2})_(\d{2})\.mp4$/i;
const CAMERA_ALIASES: Record<string, Camera> = {
  FRONT: "FRONT",
  REAR: "REAR",
  BACK: "REAR",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  CABIN: "CABIN",
  INTERIOR: "CABIN",
  INSIDE: "CABIN",
};

export function parseName(name: string): { camera: Camera; key: string; start: Date } | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const camera = CAMERA_ALIASES[m[1].toUpperCase()];
  if (!camera) return null;
  const [y, mo, d, h, mi, s] = m.slice(2).map(Number);
  const start = new Date(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(start.getTime())) return null;
  return { camera, key: m.slice(2).join(""), start };
}

export function buildSegments(files: RecFile[]): Segment[] {
  const byKey = new Map<string, Segment>();
  for (const file of files) {
    const parsed = parseName(file.name);
    if (!parsed) continue;
    let seg = byKey.get(parsed.key);
    if (!seg) {
      seg = { key: parsed.key, start: parsed.start, duration: 0, files: {} };
      byKey.set(parsed.key, seg);
    }
    seg.files[parsed.camera] = file;
  }
  return [...byKey.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Seconds a segment must reach to count as a full 5-minute rollover. */
const ROLLOVER_MIN = 295;
/** Allowed slack between a rollover's end and the next segment's start. */
const ROLLOVER_SLACK = 3;

/**
 * Groups segments into events. Segments always join when the previous one was a full
 * rollover that the next continues seamlessly. With mergeGapSeconds > 0, segments whose
 * gap to the previous segment's end is within that many seconds are merged too.
 */
export function groupEvents(segments: Segment[], mergeGapSeconds = 0): RecEvent[] {
  const events: RecEvent[] = [];
  let current: Segment[] = [];
  const flush = () => {
    if (!current.length) return;
    const offsets: number[] = [];
    let t = 0;
    for (const s of current) {
      offsets.push(t);
      t += s.duration;
    }
    events.push({ id: current[0].key, start: current[0].start, segments: current, offsets, duration: t });
    current = [];
  };
  for (const seg of segments) {
    const prev = current[current.length - 1];
    if (prev) {
      const gap = (seg.start.getTime() - prev.start.getTime()) / 1000 - prev.duration;
      const rollover = prev.duration >= ROLLOVER_MIN && Math.abs(gap) <= ROLLOVER_SLACK;
      const merge = mergeGapSeconds > 0 && gap <= mergeGapSeconds;
      if (!rollover && !merge) flush();
    }
    current.push(seg);
  }
  flush();
  return events.sort((a, b) => b.start.getTime() - a.start.getTime());
}

export function camerasIn(event: RecEvent): Set<Camera> {
  const set = new Set<Camera>();
  for (const seg of event.segments) for (const cam of Object.keys(seg.files)) set.add(cam as Camera);
  return set;
}

/** Locates the segment containing an event-relative time. */
export function locate(event: RecEvent, t: number): { index: number; local: number } {
  for (let i = event.segments.length - 1; i >= 0; i--) {
    if (t >= event.offsets[i]) {
      return { index: i, local: Math.min(t - event.offsets[i], event.segments[i].duration) };
    }
  }
  return { index: 0, local: 0 };
}

// ---- formatting, matching the car's wording ----

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatLength(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatTimeOfDay(d: Date, h24 = false): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: !h24 });
}

export function dayLabel(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
