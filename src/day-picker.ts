import { dayLabel, type RecEvent } from "./recordings";
import "./day-picker.css";
import { dateFromDay, recordedDays, recordingDay } from "./recording-days";

export class DayPicker {
  day: string | null = null;
  private days: string[] = [];
  private month = new Date();
  private open = false;

  constructor(private host: HTMLElement, private onChange: () => void) {
    host.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!button || button.disabled) return;
      const action = button.dataset.dayAction;
      if (action === "toggle") {
        this.open = !this.open;
        if (this.open) this.month = dateFromDay(this.day ?? this.days[0]);
        this.render();
        if (this.open) (this.host.querySelector<HTMLButtonElement>(".calendar-day[aria-pressed=true]") ?? this.host.querySelector<HTMLButtonElement>(".calendar-day:not(:disabled)"))?.focus();
      } else if (action === "older" || action === "newer") {
        const index = this.days.indexOf(this.day ?? this.days[0]);
        this.choose(this.days[index + (action === "older" ? 1 : -1)]);
      } else if (action === "month-back" || action === "month-forward") {
        this.month = new Date(this.month.getFullYear(), this.month.getMonth() + (action === "month-back" ? -1 : 1), 1);
        this.render();
        this.host.querySelector<HTMLButtonElement>(`[data-day-action="${action}"]`)?.focus();
      } else if (action === "all") this.choose(null);
      else if (button.dataset.day) this.choose(button.dataset.day);
    });
    document.addEventListener("click", (event) => {
      if (this.open && !event.composedPath().includes(host)) { this.open = false; this.render(); }
    });
    host.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.open) {
        event.stopPropagation(); this.open = false; this.render(); this.focusTrigger();
      }
    });
  }

  update(events: RecEvent[], reset = false) {
    this.days = recordedDays(events);
    if (reset || (this.day !== null && !this.days.includes(this.day))) this.day = this.days[0] ?? null;
    if (!this.days.length) this.open = false;
    this.render();
  }

  follow(day: string) {
    if (this.day === null || this.day === day) return;
    this.day = day;
    this.render();
  }

  private choose(day: string | null | undefined) {
    if (day === undefined) return;
    this.day = day; this.open = false; this.render(); this.onChange(); this.focusTrigger();
  }

  private focusTrigger() { this.host.querySelector<HTMLButtonElement>("[data-day-action=toggle]")?.focus(); }

  private render() {
    this.host.hidden = !this.days.length;
    const index = this.days.indexOf(this.day ?? this.days[0]);
    const label = this.day ? dayLabel(dateFromDay(this.day)) : "All recordings";
    this.host.innerHTML = `<div class="day-header day-controls">
      <button class="day-nav" data-day-action="older" aria-label="Previous recorded day" ${index >= this.days.length - 1 ? "disabled" : ""}>‹</button>
      <button class="day-trigger" data-day-action="toggle" aria-expanded="${this.open}" aria-controls="recording-calendar" aria-label="Choose recording day: ${label}">${label}<span aria-hidden="true">▾</span></button>
      <button class="day-nav" data-day-action="newer" aria-label="Next recorded day" ${index <= 0 ? "disabled" : ""}>›</button>
    </div>`;
    if (!this.open) return;
    const year = this.month.getFullYear(), month = this.month.getMonth();
    const first = new Date(year, month, 1);
    const oldest = dateFromDay(this.days[this.days.length - 1]), newest = dateFromDay(this.days[0]);
    const beforeOldest = year * 12 + month <= oldest.getFullYear() * 12 + oldest.getMonth();
    const afterNewest = year * 12 + month >= newest.getFullYear() * 12 + newest.getMonth();
    const available = new Set(this.days);
    const cells: string[] = Array.from({ length: first.getDay() }, () => '<span></span>');
    for (let date = 1; date <= new Date(year, month + 1, 0).getDate(); date++) {
      const day = recordingDay(new Date(year, month, date));
      const fullLabel = dateFromDay(day).toLocaleDateString(undefined, { dateStyle: "full" });
      cells.push(`<button class="calendar-day" data-day="${day}" aria-label="${fullLabel}" aria-pressed="${day === this.day}" ${available.has(day) ? "" : "disabled"}>${date}</button>`);
    }
    this.host.insertAdjacentHTML("beforeend", `<div id="recording-calendar" class="recording-calendar" role="region" aria-label="Recording calendar">
      <div class="calendar-month"><button class="day-nav" data-day-action="month-back" aria-label="Previous month" ${beforeOldest ? "disabled" : ""}>‹</button>
        <strong>${first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button class="day-nav" data-day-action="month-forward" aria-label="Next month" ${afterNewest ? "disabled" : ""}>›</button></div>
      <div class="calendar-grid">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => `<span class="calendar-weekday">${day}</span>`).join("")}${cells.join("")}</div>
      <p>Highlighted dates have recordings.</p><button class="calendar-all" data-day-action="all">Show all recordings</button>
    </div>`);
  }
}
