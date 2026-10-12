import { describe, expect, it } from "vitest";
import { findMvhdDuration, readMp4Duration } from "../src/mp4";
import {
  buildSegments,
  formatClock,
  formatLength,
  groupEvents,
  locate,
  parseName,
  type RecFile,
} from "../src/recordings";

const fake = (name: string): RecFile => ({
  name,
  size: 0,
  url: async () => name,
  read: async () => new ArrayBuffer(0),
});

// Real segment starts and durations from a VISTIQ drive (2026-10-12).
const REAL: [string, number][] = [
  ["15_44_52", 32],
  ["15_47_20", 184],
  ["15_51_20", 64],
  ["15_52_41", 4],
  ["16_24_10", 300],
  ["16_29_10", 300],
  ["16_34_10", 248],
  ["16_38_24", 2],
];

function realSegments() {
  const files = REAL.flatMap(([t]) =>
    ["FRONT", "REAR", "LEFT", "RIGHT"].map((c) => fake(`${c}_2026_10_12_T_${t}.mp4`)),
  );
  const segs = buildSegments(files);
  segs.forEach((s, i) => (s.duration = REAL[i][1]));
  return segs;
}

describe("parseName", () => {
  it("parses camera and local start time", () => {
    const p = parseName("REAR_2026_10_12_T_16_24_10.mp4")!;
    expect(p.camera).toBe("REAR");
    expect(p.start).toEqual(new Date(2026, 9, 12, 16, 24, 10));
    expect(p.key).toBe("20261012162410");
  });

  it("rejects unrelated files", () => {
    expect(parseName("IMG_0001.mp4")).toBeNull();
    expect(parseName("FRONT_2026_10_12_T_16_24_10.mov")).toBeNull();
    expect(parseName("DRONE_2026_10_12_T_16_24_10.mp4")).toBeNull();
  });
});

describe("groupEvents", () => {
  it("joins seamless 5-minute rollovers into one event", () => {
    const events = groupEvents(realSegments());
    const big = events.find((e) => e.segments.length === 3)!;
    expect(big.start).toEqual(new Date(2026, 9, 12, 16, 24, 10));
    expect(formatClock(big.duration)).toBe("14:08"); // matches the car's "2:55 / 14:08"
    expect(formatLength(big.duration)).toBe("14 min");
  });

  it("keeps a short clip right after a non-rollover segment separate", () => {
    const events = groupEvents(realSegments());
    expect(events[0].start).toEqual(new Date(2026, 9, 12, 16, 38, 24));
    expect(formatLength(events[0].duration)).toBe("2 sec");
  });

  it("merges nearby recordings when a gap is allowed", () => {
    const events = groupEvents(realSegments(), 120);
    expect(events.map((e) => e.segments.length)).toEqual([4, 4]);
  });

  it("lists newest first and indexes all four cameras", () => {
    const events = groupEvents(realSegments());
    expect(events.length).toBe(6);
    expect(Object.keys(events.at(-1)!.segments[0].files).sort()).toEqual(["FRONT", "LEFT", "REAR", "RIGHT"]);
  });
});

describe("locate", () => {
  it("maps event time to segment and local time", () => {
    const big = groupEvents(realSegments()).find((e) => e.segments.length === 3)!;
    expect(locate(big, 175)).toEqual({ index: 0, local: 175 });
    expect(locate(big, 300)).toEqual({ index: 1, local: 0 });
    expect(locate(big, 700)).toEqual({ index: 2, local: 100 });
  });
});

describe("mp4", () => {
  function box(type: string, payload: Uint8Array) {
    const b = new Uint8Array(8 + payload.length);
    new DataView(b.buffer).setUint32(0, b.length);
    b.set([...type].map((c) => c.charCodeAt(0)), 4);
    b.set(payload, 8);
    return b;
  }

  function mvhd(timescale: number, duration: number) {
    const p = new Uint8Array(100);
    const v = new DataView(p.buffer);
    v.setUint32(12, timescale);
    v.setUint32(16, duration);
    return box("mvhd", p);
  }

  it("reads duration from a trailing moov box", async () => {
    const parts = [box("ftyp", new Uint8Array(16)), box("mdat", new Uint8Array(500)), box("moov", mvhd(1000, 248000))];
    const file = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      file.set(p, o);
      o += p.length;
    }
    const read = async (s: number, e: number) => file.slice(s, e).buffer;
    expect(await readMp4Duration(read, file.length)).toBe(248);
  });

  it("returns null without mvhd", () => {
    expect(findMvhdDuration(new DataView(box("free", new Uint8Array(4)).buffer))).toBeNull();
  });
});
