// Plays an event (a run of segments) as one continuous timeline across up to five
// cameras. One <video> per camera stays loaded with the current segment so switching
// cameras is instant; in quad view the surround cameras play together, slaved to a clock.

import { CAMERAS, SURROUND, locate, type Camera, type RecEvent } from "./recordings";

const DRIFT_TOLERANCE = 0.25;

export class Player {
  readonly videos: Record<Camera, HTMLVideoElement>;
  event: RecEvent | null = null;
  segIndex = 0;
  camera: Camera = "FRONT";
  quad = false;
  playing = false;
  rate = 1;
  /** Fired with the event-relative time whenever it changes. */
  onTime: (t: number) => void = () => {};
  /** Fired when play state, camera, layout, or segment changes. */
  onState: () => void = () => {};
  /** Fired when the last segment finishes. */
  onEnded: () => void = () => {};

  private gen = 0;
  private raf = 0;
  private pendingLocal = 0;

  constructor(private readonly host: HTMLElement) {
    this.videos = {} as Record<Camera, HTMLVideoElement>;
    for (const cam of CAMERAS) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.camera = cam;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.disablePictureInPicture = true;
      const label = document.createElement("span");
      label.className = "tile-label";
      label.textContent = cam[0] + cam.slice(1).toLowerCase();
      const missing = document.createElement("span");
      missing.className = "tile-missing";
      missing.textContent = "Not recorded";
      tile.append(v, label, missing);
      host.append(tile);
      v.addEventListener("ended", () => v === this.clock() && this.advance());
      v.addEventListener("timeupdate", () => v === this.clock() && this.syncFollowers());
      this.videos[cam] = v;
    }
    this.layout();
  }

  get segment() {
    return this.event?.segments[this.segIndex] ?? null;
  }

  /** The video whose currentTime drives the timeline for the current segment. */
  clock(): HTMLVideoElement {
    const files = this.segment?.files ?? {};
    if (!this.quad && files[this.camera]) return this.videos[this.camera];
    const cam = (this.quad ? SURROUND : CAMERAS).find((c) => files[c]) ?? CAMERAS.find((c) => files[c]) ?? "FRONT";
    return this.videos[cam];
  }

  get time(): number {
    if (!this.event) return 0;
    const v = this.clock();
    const local = v.readyState >= 1 ? v.currentTime : this.pendingLocal;
    return this.event.offsets[this.segIndex] + local;
  }

  async load(event: RecEvent, t = 0, autoplay = false) {
    this.event = event;
    const { index, local } = locate(event, t);
    await this.loadSegment(index, local, autoplay);
  }

  unload() {
    this.gen++;
    this.event = null;
    this.stopTicker();
    this.playing = false;
    for (const v of Object.values(this.videos)) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    this.layout();
    this.onState();
  }

  private async loadSegment(index: number, local: number, autoplay: boolean) {
    const gen = ++this.gen;
    const seg = this.event!.segments[index];
    this.segIndex = index;
    this.pendingLocal = local;
    this.layout();
    await Promise.all(
      CAMERAS.map(async (cam) => {
        const v = this.videos[cam];
        v.pause();
        const file = seg.files[cam];
        if (!file) {
          v.removeAttribute("src");
          v.load();
          return;
        }
        const url = await file.url();
        if (gen !== this.gen) return;
        v.src = url;
        v.playbackRate = this.rate;
        await whenReady(v);
        if (gen !== this.gen) return;
        v.currentTime = Math.min(local, Math.max(0, v.duration - 0.05) || local);
      }),
    );
    if (gen !== this.gen) return;
    this.onTime(this.time);
    this.onState();
    if (autoplay) this.play();
  }

  private advance() {
    if (!this.event) return;
    if (this.segIndex + 1 < this.event.segments.length) {
      this.loadSegment(this.segIndex + 1, 0, this.playing);
    } else {
      this.pause();
      this.onTime(this.event.duration);
      this.onEnded();
    }
  }

  private active(): HTMLVideoElement[] {
    const files = this.segment?.files ?? {};
    if (!this.quad) return [this.clock()];
    return SURROUND.filter((c) => files[c]).map((c) => this.videos[c]);
  }

  play() {
    if (!this.event) return;
    const atEnd = this.time >= this.event.duration - 0.05;
    if (atEnd) {
      this.seek(0).then(() => this.play());
      return;
    }
    this.playing = true;
    const clock = this.clock();
    for (const v of this.active()) {
      if (v !== clock) v.currentTime = clock.currentTime;
      v.playbackRate = this.rate;
      v.play().catch(() => {});
    }
    this.startTicker();
    this.onState();
  }

  pause() {
    this.playing = false;
    for (const v of Object.values(this.videos)) v.pause();
    this.stopTicker();
    this.onTime(this.time);
    this.onState();
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  async seek(t: number) {
    if (!this.event) return;
    t = Math.max(0, Math.min(t, this.event.duration));
    const { index, local } = locate(this.event, t);
    if (index !== this.segIndex) {
      await this.loadSegment(index, local, this.playing);
      return;
    }
    this.pendingLocal = local;
    // Hidden cameras catch up in handover() when they are shown.
    for (const v of this.active()) {
      if (v.readyState >= 1) v.currentTime = local;
    }
    this.onTime(t);
  }

  setRate(rate: number) {
    this.rate = rate;
    for (const v of Object.values(this.videos)) v.playbackRate = rate;
    this.onState();
  }

  setCamera(cam: Camera) {
    const before = this.clock();
    const wasPlaying = this.playing;
    this.camera = cam;
    this.quad = false;
    this.handover(before, wasPlaying);
  }

  setQuad(on: boolean) {
    const before = this.clock();
    this.quad = on;
    this.handover(before, this.playing);
  }

  /** Moves playback from the previous clock video to the new active set. */
  private handover(before: HTMLVideoElement, wasPlaying: boolean) {
    const t = before.currentTime;
    for (const v of Object.values(this.videos)) {
      if (!this.active().includes(v)) v.pause();
      else if (v.readyState >= 1 && Math.abs(v.currentTime - t) > 0.05) v.currentTime = t;
    }
    this.layout();
    if (wasPlaying) this.play();
    this.onState();
  }

  private syncFollowers() {
    if (!this.quad || !this.playing) return;
    const clock = this.clock();
    for (const v of this.active()) {
      if (v === clock || v.readyState < 1) continue;
      if (Math.abs(v.currentTime - clock.currentTime) > DRIFT_TOLERANCE) v.currentTime = clock.currentTime;
      if (v.paused) v.play().catch(() => {});
    }
  }

  private layout() {
    const files = this.segment?.files ?? {};
    this.host.classList.toggle("quad", this.quad);
    for (const cam of CAMERAS) {
      const tile = this.videos[cam].parentElement!;
      const visible = this.quad ? SURROUND.includes(cam) : cam === this.camera;
      tile.classList.toggle("visible", visible && !!this.event);
      tile.classList.toggle("missing", !!this.event && !files[cam]);
    }
  }

  private startTicker() {
    this.stopTicker();
    const tick = () => {
      this.onTime(this.time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopTicker() {
    cancelAnimationFrame(this.raf);
  }

  /** Visible frames for snapshots: one in single view, the 2x2 grid in quad view. */
  visibleVideos(): { cam: Camera; video: HTMLVideoElement }[] {
    const cams = this.quad ? SURROUND : [this.camera];
    return cams.map((cam) => ({ cam, video: this.videos[cam] }));
  }
}

function whenReady(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener("loadedmetadata", done);
      v.removeEventListener("error", done);
      resolve();
    };
    v.addEventListener("loadedmetadata", done);
    v.addEventListener("error", done);
  });
}
