import "./styles.css";
import { icons, type IconName } from "./icons";
import { readMp4Duration } from "./mp4";
import { Player } from "./player";
import {
  CAMERAS,
  buildSegments,
  camerasIn,
  dayLabel,
  formatClock,
  formatLength,
  formatTimeOfDay,
  groupEvents,
  type Camera,
  type RecEvent,
  type RecFile,
  type Segment,
} from "./recordings";
import { loadSettings, saveSettings } from "./settings";
import { native, loadNativeDir, type RecorderDir } from "./sources/native";
import {
  RECORDER_PATH,
  handlePermission,
  loadFromDirectory,
  loadFromDrop,
  loadFromFileList,
  loadHandle,
  pickDirectory,
  saveHandle,
  supportsDirectoryPicker,
  type LoadedSource,
} from "./sources/web";
import { thumbnail } from "./thumbs";

const RATES = [0.25, 0.5, 1, 2, 4, 8];
const CAMERA_ICONS: Record<Camera, IconName> = {
  FRONT: "front",
  REAR: "rear",
  LEFT: "left",
  RIGHT: "right",
  CABIN: "cabin",
};

const settings = loadSettings();
let segments: Segment[] = [];
let events: RecEvent[] = [];
let selected: RecEvent | null = null;
let source: { label: string; nativeDir?: RecorderDir } | null = null;
let view: "recordings" | "settings" = "recordings";
let busy = "";

// ---------------------------------------------------------------- shell

const btn = (cls: string, icon: IconName, title: string, attrs = "") =>
  `<button class="${cls}" title="${title}" aria-label="${title}" ${attrs}>${icons[icon]}</button>`;

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div class="screen">
  <nav class="rail">
    ${btn("rail-btn", "recorder", "Recordings", 'data-view="recordings"')}
    ${btn("rail-btn", "gear", "Settings", 'data-view="settings"')}
  </nav>
  <section class="library">
    <div class="event-list" id="events"></div>
    <div class="settings hidden" id="settings"></div>
  </section>
  <section class="stage">
    <div class="viewport" id="viewport"><div class="placeholder" id="placeholder"></div></div>
    <div class="timeline">
      <div class="track" id="track">
        <div class="track-line"></div>
        <div class="track-marks" id="marks"></div>
        <div class="track-fill" id="fill"></div>
        <div class="track-head" id="head"></div>
      </div>
      <div class="time" id="time">0:00 / 0:00</div>
    </div>
  </section>
  <aside class="cams" id="cams">
    ${CAMERAS.map((c) => btn("ring cam", CAMERA_ICONS[c], `${c[0]}${c.slice(1).toLowerCase()} camera`, `data-cam="${c}"`)).join("")}
    ${btn("ring cam", "quad", "All four cameras", 'data-cam="QUAD"')}
  </aside>
  <footer class="dock">
    <div class="dock-left">
      ${btn("dock-btn", "folder", "Open flash drive or folder", 'data-act="open"')}
      ${btn("dock-btn", "usb", "Rescan drives", 'data-act="rescan"')}
      ${btn("dock-btn", "files", "Open individual video files", 'data-act="files"')}
      ${btn("dock-btn", "prev", "Newer recording", 'data-act="newer"')}
      ${btn("dock-btn", "next", "Older recording", 'data-act="older"')}
      ${btn("dock-btn", "fullscreen", "Full screen", 'data-act="fullscreen"')}
    </div>
    <div class="dock-right">
      ${btn("ring", "back10", "Back 10 seconds", 'data-act="back"')}
      ${btn("ring", "play", "Play", 'data-act="play" id="play"')}
      ${btn("ring", "fwd10", "Forward 10 seconds", 'data-act="fwd"')}
      <button class="ring rate" data-act="rate" id="rate" title="Playback speed" aria-label="Playback speed">1×</button>
      ${btn("ring", "snapshot", "Save snapshot", 'data-act="snapshot"')}
      ${btn("ring", "save", "Save this video file", 'data-act="save"')}
    </div>
    <div class="status">
      <span class="badge" id="badge" hidden></span>
      <span class="clock" id="clock"></span>
    </div>
  </footer>
  <input type="file" id="dir-input" webkitdirectory multiple hidden />
  <input type="file" id="file-input" accept="video/mp4,.mp4" multiple hidden />
  <div class="drop-overlay" id="drop"><div>Drop the flash drive or recordings folder</div></div>
  <div class="toast" id="toast"></div>
</div>`;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const listEl = $("#events");
const settingsEl = $("#settings");
const viewport = $("#viewport");
const placeholder = $("#placeholder");
const track = $("#track");
const fillEl = $("#fill");
const headEl = $("#head");
const marksEl = $("#marks");
const timeEl = $("#time");
const playBtn = $("#play");
const rateBtn = $("#rate");
const dirInput = $<HTMLInputElement>("#dir-input");
const fileInput = $<HTMLInputElement>("#file-input");

const player = new Player(viewport);

// ---------------------------------------------------------------- loading

async function useSource(loaded: LoadedSource, nativeDir?: RecorderDir) {
  player.unload();
  source = { label: loaded.label, nativeDir };
  segments = buildSegments(loaded.files);
  selected = null;
  events = [];
  if (!segments.length) {
    busy = "";
    renderAll();
    toast(`No Surround Vision recordings found in “${loaded.label}”.`);
    return;
  }
  busy = `Reading ${segments.length} recordings…`;
  renderAll();
  await probeDurations(segments);
  busy = "";
  regroup();
  if (events[0]) select(events[0], false);
}

async function probeDurations(segs: Segment[]) {
  let next = 0;
  const worker = async () => {
    while (next < segs.length) {
      const seg = segs[next++];
      const file = seg.files.FRONT ?? Object.values(seg.files)[0]!;
      seg.duration = (await readMp4Duration(file.read, file.size).catch(() => null)) ?? (await videoDuration(file));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

async function videoDuration(file: RecFile): Promise<number> {
  const v = document.createElement("video");
  v.preload = "metadata";
  v.src = await file.url();
  return new Promise((resolve) => {
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => resolve(0);
  });
}

function regroup() {
  const keep = selected ? { start: selected.start.getTime() + player.time * 1000 } : null;
  events = groupEvents(segments, settings.mergeGap);
  renderList();
  if (keep) {
    const ev = events.find((e) => keep.start >= e.start.getTime() && keep.start <= e.start.getTime() + e.duration * 1000);
    if (ev) select(ev, false, (keep.start - ev.start.getTime()) / 1000);
  }
}

async function openFolder() {
  try {
    if (native) {
      const dir = await native.pickFolder();
      if (!dir) return;
      if (dir.empty) return toast(`No recordings found in “${dir.label}”.`);
      return useSource(await loadNativeDir(dir), dir);
    }
    if (supportsDirectoryPicker) {
      const handle = await pickDirectory();
      await saveHandle(handle);
      return useSource(await loadFromDirectory(handle));
    }
    dirInput.click();
  } catch (err) {
    if ((err as DOMException)?.name !== "AbortError") toast(String((err as Error).message ?? err));
  }
}

async function rescan(interactive: boolean) {
  if (native) {
    const dirs = await native.findRecorderDirs();
    const current = dirs.find((d) => d.path === source?.nativeDir?.path);
    // A different drive came or went: don't interrupt what's playing.
    if (current && !interactive) return;
    // Prefer staying on the current drive; otherwise take the first one found.
    const dir = current ?? dirs[0];
    if (dir) return useSource(await loadNativeDir(dir), dir);
    if (source?.nativeDir) {
      source = null;
      segments = [];
      events = [];
      selected = null;
      player.unload();
      renderAll();
    }
    if (interactive) toast("No flash drive with Surround Vision recordings found.");
    return;
  }
  const handle = await loadHandle();
  if (!handle) return interactive ? openFolder() : undefined;
  if ((await handlePermission(handle, interactive)) === "granted") {
    await useSource(await loadFromDirectory(handle));
  } else {
    renderList();
  }
}

// ---------------------------------------------------------------- rendering

function renderAll() {
  renderList();
  renderSettings();
  renderState();
  renderTime(player.time);
  renderMarks();
}

function renderList() {
  listEl.classList.toggle("hidden", view !== "recordings");
  if (busy) {
    listEl.innerHTML = `<div class="empty"><div class="spinner"></div><p>${busy}</p></div>`;
    return;
  }
  if (!events.length) {
    listEl.innerHTML = emptyState();
    loadHandle().then((h) => {
      const el = listEl.querySelector<HTMLElement>("[data-act=reconnect]");
      if (h && el && !native) {
        el.hidden = false;
        el.textContent = `Reconnect “${h.name}”`;
      }
    });
    return;
  }
  listEl.innerHTML = "";
  let lastDay = "";
  for (const ev of events) {
    const day = dayLabel(ev.start);
    if (day !== lastDay) {
      lastDay = day;
      const h = document.createElement("div");
      h.className = "day-header";
      h.textContent = day;
      listEl.append(h);
    }
    const item = document.createElement("button");
    item.className = "event";
    item.dataset.id = ev.id;
    item.innerHTML = `
      <span class="thumb"><img alt="" /></span>
      <span class="meta">
        <span class="when">${formatTimeOfDay(ev.start, settings.clock24)}</span>
        <span class="len">${formatLength(ev.duration)}</span>
      </span>`;
    item.addEventListener("click", () => select(ev, true));
    listEl.append(item);
    const file = ev.segments[0].files.FRONT ?? Object.values(ev.segments[0].files)[0];
    if (file) {
      thumbnail(file).then((url) => {
        const img = item.querySelector("img")!;
        if (url) img.src = url;
      });
    }
  }
  markSelected();
}

function emptyState(): string {
  const path = RECORDER_PATH.join(native?.platform === "win32" ? "\\" : "/");
  const actions = native
    ? `<button class="pill" data-act="open">Choose folder…</button>
       <button class="pill ghost" data-act="rescan">Scan drives again</button>`
    : `<button class="pill" data-act="open">Open flash drive…</button>
       <button class="pill ghost" data-act="reconnect" hidden></button>
       <button class="pill ghost" data-act="files">Pick video files…</button>`;
  return `
    <div class="empty">
      <div class="empty-icon">${icons.usb}</div>
      <h2>Insert your vehicle’s flash drive</h2>
      <p>${
        native
          ? "Drives are scanned automatically for Surround Vision recordings."
          : "Select the drive (or its recordings folder). You can also drop it onto this window."
      }</p>
      <code>${path}</code>
      <div class="actions">${actions}</div>
    </div>`;
}

function markSelected() {
  for (const el of listEl.querySelectorAll<HTMLElement>(".event")) {
    const on = el.dataset.id === selected?.id;
    el.classList.toggle("selected", on);
    if (on) el.scrollIntoView({ block: "nearest" });
  }
}

function renderSettings() {
  settingsEl.classList.toggle("hidden", view !== "settings");
  if (view !== "settings") return;
  const gapOptions: [number, string][] = [
    [0, "Continuous recordings only"],
    [60, "Less than 1 min apart"],
    [120, "Less than 2 min apart"],
    [300, "Less than 5 min apart"],
    [900, "Less than 15 min apart"],
  ];
  settingsEl.innerHTML = `
    <div class="day-header">Settings</div>
    <div class="setting">
      <div><div class="label">Recordings source</div><div class="sub">${source ? escapeHtml(source.label) : "None selected"}</div></div>
      <button class="pill" data-act="open">Change…</button>
    </div>
    <label class="setting">
      <div><div class="label">Combine recordings</div><div class="sub">The recorder saves 5-minute pieces; continuous pieces are always joined.</div></div>
      <select id="set-gap">${gapOptions.map(([v, l]) => `<option value="${v}" ${v === settings.mergeGap ? "selected" : ""}>${l}</option>`).join("")}</select>
    </label>
    <label class="setting">
      <div><div class="label">Starting camera</div></div>
      <select id="set-cam">${CAMERAS.map((c) => `<option value="${c}" ${c === settings.startCamera ? "selected" : ""}>${c[0]}${c.slice(1).toLowerCase()}</option>`).join("")}</select>
    </label>
    <label class="setting">
      <div><div class="label">Continue to next recording</div><div class="sub">Plays the next newer recording when one ends.</div></div>
      <input type="checkbox" class="switch" id="set-auto" ${settings.autoAdvance ? "checked" : ""} />
    </label>
    <label class="setting">
      <div><div class="label">24-hour clock</div></div>
      <input type="checkbox" class="switch" id="set-24" ${settings.clock24 ? "checked" : ""} />
    </label>
    <div class="setting keys">
      <div class="label">Keyboard</div>
      <div class="sub">Space play/pause · ←/→ 5 s · J/L 10 s · ↑/↓ recordings · 1–5 cameras · Q all cameras · [ ] speed · S snapshot · F full screen</div>
    </div>`;
  const update = () => {
    const gap = Number($<HTMLSelectElement>("#set-gap").value);
    const regroupNeeded = gap !== settings.mergeGap;
    const clockChanged = $<HTMLInputElement>("#set-24").checked !== settings.clock24;
    settings.mergeGap = gap;
    settings.startCamera = $<HTMLSelectElement>("#set-cam").value as Camera;
    settings.autoAdvance = $<HTMLInputElement>("#set-auto").checked;
    settings.clock24 = $<HTMLInputElement>("#set-24").checked;
    saveSettings(settings);
    if (regroupNeeded) regroup();
    else if (clockChanged) renderList();
    renderClock();
  };
  settingsEl.querySelectorAll("select, input").forEach((el) => el.addEventListener("change", update));
}

function renderState() {
  const cams = selected ? camerasIn(selected) : new Set<Camera>();
  for (const el of document.querySelectorAll<HTMLButtonElement>(".cam")) {
    const cam = el.dataset.cam!;
    const available = cam === "QUAD" ? cams.size > 1 : cams.has(cam as Camera);
    el.disabled = !available;
    el.classList.toggle("active", cam === "QUAD" ? player.quad : !player.quad && player.camera === cam);
  }
  playBtn.innerHTML = player.playing ? icons.pause : icons.play;
  playBtn.title = player.playing ? "Pause" : "Play";
  playBtn.classList.toggle("active", player.playing);
  rateBtn.textContent = `${player.rate}×`;
  rateBtn.classList.toggle("active", player.rate !== 1);
  for (const el of document.querySelectorAll<HTMLElement>(".rail-btn")) {
    el.classList.toggle("active", el.dataset.view === view);
  }
  const badge = $("#badge");
  badge.hidden = !source;
  if (source) {
    badge.textContent = source.label.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1).toUpperCase() || "•";
    badge.title = source.label;
  }
  placeholder.textContent = selected ? "" : events.length ? "Select a recording" : "";
  placeholder.hidden = !!selected;
  for (const el of document.querySelectorAll<HTMLButtonElement>(".dock button")) {
    if (["play", "back", "fwd", "snapshot", "save", "rate", "newer", "older"].includes(el.dataset.act ?? "")) {
      el.disabled = !selected;
    }
  }
}

function renderTime(t: number) {
  const total = selected?.duration ?? 0;
  const pct = total ? Math.min(100, (t / total) * 100) : 0;
  fillEl.style.width = `${pct}%`;
  headEl.style.left = `${pct}%`;
  timeEl.textContent = `${formatClock(t)} / ${formatClock(total)}`;
}

function renderMarks() {
  marksEl.innerHTML = "";
  if (!selected || selected.segments.length < 2) return;
  for (const off of selected.offsets.slice(1)) {
    const m = document.createElement("span");
    m.style.left = `${(off / selected.duration) * 100}%`;
    marksEl.append(m);
  }
}

function renderClock() {
  $("#clock").textContent = formatTimeOfDay(new Date(), settings.clock24).replace(/\s?[AP]M$/i, "");
}

// ---------------------------------------------------------------- actions

async function select(ev: RecEvent, autoplay: boolean, at = 0) {
  selected = ev;
  const cams = camerasIn(ev);
  if (!player.quad && !cams.has(player.camera)) player.camera = cams.has(settings.startCamera) ? settings.startCamera : [...cams][0];
  markSelected();
  renderMarks();
  renderState();
  renderTime(at);
  await player.load(ev, at, autoplay);
}

function step(delta: number) {
  if (!selected) return;
  const i = events.indexOf(selected);
  const next = events[i + delta];
  if (next) select(next, player.playing);
}

function toast(msg: string) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout((toast as any).t);
  (toast as any).t = setTimeout(() => el.classList.remove("show"), 4000);
}

function stamp(): string {
  const seg = player.segment!;
  const local = Math.floor(player.time - selected!.offsets[player.segIndex]);
  return `${seg.key.replace(/^(\d{8})/, "$1_")}_+${String(Math.floor(local / 60)).padStart(2, "0")}m${String(local % 60).padStart(2, "0")}s`;
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

function snapshot() {
  if (!selected) return;
  const frames = player.visibleVideos().filter((f) => f.video.readyState >= 2);
  if (!frames.length) return;
  const w = frames[0].video.videoWidth;
  const h = frames[0].video.videoHeight;
  const cols = frames.length > 1 ? 2 : 1;
  const rows = Math.ceil(frames.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = w * cols;
  canvas.height = h * rows;
  const ctx = canvas.getContext("2d")!;
  frames.forEach((f, i) => ctx.drawImage(f.video, (i % cols) * w, Math.floor(i / cols) * h, w, h));
  const label = player.quad ? "ALL" : player.camera;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    download(url, `${label}_${stamp()}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, "image/png");
}

async function saveFile() {
  const seg = player.segment;
  if (!seg) return;
  const cams = player.quad ? (["FRONT", "REAR", "LEFT", "RIGHT"] as Camera[]) : [player.camera];
  for (const cam of cams) {
    const file = seg.files[cam];
    if (file) download(await file.url(), file.name);
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else viewport.requestFullscreen?.().catch(() => {});
}

const actions: Record<string, () => unknown> = {
  open: openFolder,
  rescan: () => rescan(true),
  reconnect: () => rescan(true),
  files: () => fileInput.click(),
  newer: () => step(-1),
  older: () => step(1),
  fullscreen: toggleFullscreen,
  back: () => player.seek(player.time - 10),
  fwd: () => player.seek(player.time + 10),
  play: () => player.toggle(),
  rate: () => player.setRate(RATES[(RATES.indexOf(player.rate) + 1) % RATES.length] ?? 1),
  snapshot,
  save: saveFile,
};

document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act], [data-cam], [data-view]");
  if (!el || (el as HTMLButtonElement).disabled) return;
  if (el.dataset.act) actions[el.dataset.act]?.();
  else if (el.dataset.cam) {
    if (el.dataset.cam === "QUAD") player.setQuad(!player.quad);
    else player.setCamera(el.dataset.cam as Camera);
  } else if (el.dataset.view) {
    view = el.dataset.view as typeof view;
    renderList();
    renderSettings();
    renderState();
  }
});

viewport.addEventListener("click", () => selected && player.toggle());
viewport.addEventListener("dblclick", toggleFullscreen);

dirInput.addEventListener("change", () => {
  if (dirInput.files?.length) useSource(loadFromFileList(dirInput.files, "Folder"));
  dirInput.value = "";
});
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) useSource(loadFromFileList(fileInput.files, "Files"));
  fileInput.value = "";
});

// Scrubbing on the timeline.
let scrubbing = false;
let lastSeek = 0;
function scrubTo(e: PointerEvent, final: boolean) {
  if (!selected) return;
  const r = track.getBoundingClientRect();
  const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * selected.duration;
  renderTime(t);
  const now = performance.now();
  if (final || now - lastSeek > 120) {
    lastSeek = now;
    player.seek(t);
  }
}
track.addEventListener("pointerdown", (e) => {
  if (!selected) return;
  scrubbing = true;
  try {
    track.setPointerCapture(e.pointerId);
  } catch {}
  track.classList.add("scrubbing");
  scrubTo(e, false);
});
track.addEventListener("pointermove", (e) => scrubbing && scrubTo(e, false));
track.addEventListener("pointerup", (e) => {
  if (!scrubbing) return;
  scrubbing = false;
  track.classList.remove("scrubbing");
  scrubTo(e, true);
});

// Drag & drop of the drive / folder / files.
let dragDepth = 0;
const dropEl = $("#drop");
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  dropEl.classList.add("show");
});
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropEl.classList.remove("show");
  }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropEl.classList.remove("show");
  if (!e.dataTransfer) return;
  const loaded = await loadFromDrop(e.dataTransfer);
  if (loaded) useSource(loaded);
});

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).closest("input, select, textarea") || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  const handled = (() => {
    if (k === " " || k === "k" || k === "K") return actions.play();
    if (k === "ArrowLeft") return player.seek(player.time - (e.shiftKey ? 30 : 5));
    if (k === "ArrowRight") return player.seek(player.time + (e.shiftKey ? 30 : 5));
    if (k === "j" || k === "J") return actions.back();
    if (k === "l" || k === "L") return actions.fwd();
    if (k === "ArrowUp") return step(-1);
    if (k === "ArrowDown") return step(1);
    if (k === "Home") return player.seek(0);
    if (k >= "1" && k <= "5") {
      const cam = CAMERAS[Number(k) - 1];
      if (selected && camerasIn(selected).has(cam)) player.setCamera(cam);
      return;
    }
    if (k === "q" || k === "Q") return selected && player.setQuad(!player.quad);
    if (k === "f" || k === "F") return toggleFullscreen();
    if (k === "s" || k === "S") return snapshot();
    if (k === "[" || k === "]") {
      const i = RATES.indexOf(player.rate) + (k === "]" ? 1 : -1);
      return player.setRate(RATES[Math.max(0, Math.min(RATES.length - 1, i))]);
    }
    return false;
  })();
  if (handled !== false) e.preventDefault();
});

player.onTime = (t) => !scrubbing && renderTime(t);
player.onState = renderState;
player.onEnded = () => {
  if (!settings.autoAdvance || !selected) return;
  const newer = events[events.indexOf(selected) - 1];
  if (newer) select(newer, true);
};

// ---------------------------------------------------------------- startup

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

player.camera = settings.startCamera;
renderAll();
renderClock();
setInterval(renderClock, 5000);

if (native) {
  native.onDrivesChanged(() => rescan(false));
  busy = "Looking for your flash drive…";
  renderList();
  rescan(false).finally(() => {
    if (busy.startsWith("Looking")) {
      busy = "";
      renderList();
    }
  });
} else {
  rescan(false);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && import.meta.env.PROD) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
