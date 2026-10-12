import { describe, expect, it } from "vitest";
import { dateFromDay, eventsOnDay, recordedDays, recordingDay } from "../src/recording-days";
import type { RecEvent } from "../src/recordings";

function event(id: string, start: Date): RecEvent { return { id, start, segments: [], offsets: [], duration: 1 }; }

describe("recording day navigation", () => {
  it("keeps local recording dates at midnight and on daylight saving changes", () => {
    for (const day of ["2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01"]) {
      const noon = dateFromDay(day);
      expect(recordingDay(noon)).toBe(day);
      expect(recordingDay(new Date(noon.getFullYear(), noon.getMonth(), noon.getDate(), 23, 59))).toBe(day);
    }
  });
  it("offers only recorded dates in newest-first order, including previous years", () => {
    const events = [event("a", new Date(2025, 11, 31, 23)), event("b", new Date(2026, 0, 3)), event("c", new Date(2026, 0, 3, 18))];
    expect(recordedDays(events)).toEqual(["2026-01-03", "2025-12-31"]);
    expect(eventsOnDay(events, "2026-01-03").map((event) => event.id)).toEqual(["b", "c"]);
    expect(eventsOnDay(events, "2026-01-02")).toEqual([]);
    expect(eventsOnDay(events, null)).toBe(events);
  });
  it("includes an overnight recording on both dates without splitting its continuous playback", () => {
    const overnight = event("overnight", new Date(2026, 9, 11, 23, 58));
    overnight.segments = [
      { key: "before-midnight", start: overnight.start, duration: 300, files: {} },
      { key: "after-midnight", start: new Date(2026, 9, 12, 0, 3), duration: 300, files: {} },
    ];
    expect(recordedDays([overnight])).toEqual(["2026-10-12", "2026-10-11"]);
    expect(eventsOnDay([overnight], "2026-10-12")).toEqual([overnight]);
    expect(eventsOnDay([overnight], "2026-10-11")).toEqual([overnight]);
  });
});
