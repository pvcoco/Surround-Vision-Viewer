import type { RecEvent } from "./recordings";

/** Recorder filenames use local dates, so never convert the day through UTC. */
export function recordingDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

export function recordedDays(events: RecEvent[]): string[] {
  return [...new Set(events.flatMap(eventDays))].sort().reverse();
}

export function eventsOnDay(events: RecEvent[], day: string | null): RecEvent[] {
  return day === null ? events : events.filter((event) => eventDays(event).includes(day));
}

function eventDays(event: RecEvent): string[] {
  return event.segments.length ? event.segments.map((segment) => recordingDay(segment.start)) : [recordingDay(event.start)];
}
