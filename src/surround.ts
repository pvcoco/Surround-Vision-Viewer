// Surround projection and lens sampling adapted from GMSurroundVision (MIT).
// Copyright (c) 2026 ABSG Inc. See THIRD_PARTY_NOTICES.md.
import { icons } from "./icons";
import "./surround.css";
import type { Camera } from "./recordings";
import { cssHomography, edgeLines, EXTERIOR, groundQuad, solveHomography, type CameraCalibration, type ExteriorCamera, type Point } from "./surround-geometry";
import { CAMERA_PARAMETERS as PARAMS, GLOBAL_PARAMETERS as GLOBALS, DEFAULT_PROFILE_ID, TAHOE_PROFILE_ID, VEHICLE_PROFILES, normalizeCalibration as normalize, profileCalibration, type Calibration, type SurroundStyle as Style } from "./surround-profiles";

const KEY = "surroundviewviewer.surround.v1";
const PRESETS_KEY = `${KEY}.presets`;
const PROFILES_KEY = `${KEY}.vehicles`;
const ORBITS: [string, number, number][] = [["Top down", 0, 0], ["3D front", 48, 0], ["3D chase", 52, 180], ["3D quarter", 42, 35]];
const STYLE_FEATHER = { factory: 1, tactical: 0.45, cinematic: 1.6 };
const FEATHER_SCALE = 0.3;
const UNIT: Point[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// All four cameras are composited in one pass. For each ground point, the inverse
// homography maps back into the horizon-cropped, radially corrected source video.
// Overlaps favour the camera whose patch boundary is farthest away, so seams follow
// the middle of each overlap with a short normalized crossfade instead of depending
// on draw order. Only the outside of the combined coverage fades to the ground.
const VERTEX = `attribute vec2 aPos; varying vec2 vPlate;
void main() { vPlate = aPos; gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0); }`;
const FRAGMENT = `precision highp float;
varying vec2 vPlate;
uniform sampler2D uTexture0; uniform sampler2D uTexture1; uniform sampler2D uTexture2; uniform sampler2D uTexture3;
uniform mat3 uInverse[4];
uniform vec3 uFar[4]; uniform vec3 uSideA[4]; uniform vec3 uSideB[4]; uniform vec3 uNear[4];
uniform vec4 uSource[4]; // video width, video height, crop height, crop top
uniform vec4 uBlend[4];  // lens correction, feather width, opacity (0 hides), missing

vec4 sampleCamera(sampler2D tex, mat3 inverse, vec4 source, vec4 blend) {
  vec3 projected = inverse * vec3(vPlate - 0.5 / 1440.0, 1.0);
  if (projected.z <= 0.000001) return vec4(0.0);
  vec2 band = clamp(projected.xy / projected.z, 0.0, 1.0);
  if (blend.w > 0.5) {
    float stripe = fract((band.x * source.x / source.y + band.y) * 9.0);
    return vec4(mix(vec3(0.055, 0.067, 0.086), vec3(0.102, 0.118, 0.145), step(0.5, stripe)), 1.0);
  }
  vec2 point = vec2(band.x * source.x + 0.5 * (source.x / 1440.0 - 1.0), band.y * source.z + 0.5 * (source.z / 1440.0 - 1.0) + source.w);
  vec2 center = source.xy * 0.5; vec2 offset = point - center;
  float radius = dot(offset, offset) / dot(center, center);
  vec2 uv = (center + (1.0 - blend.x * radius) * offset + 1.0) / source.xy;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return vec4(texture2D(tex, uv).rgb, 1.0);
}

// Distance inside the far and side edges, or a negative value outside the patch.
float reach(vec3 far, vec3 sideA, vec3 sideB, vec3 near, vec4 blend) {
  vec3 p = vec3(vPlate, 1.0);
  float edge = min(dot(far, p), min(dot(sideA, p), dot(sideB, p)));
  return blend.z > 0.0 && dot(near, p) > 0.0 ? edge : -1.0;
}

float coverage(vec3 near, float edge, vec4 blend) {
  return smoothstep(0.0, blend.y, edge) * clamp(dot(near, vec3(vPlate, 1.0)) / 0.006, 0.0, 1.0) * blend.z;
}

// Seam preference in log space; missing cameras yield to any real footage.
float preference(float edge, vec4 blend) {
  return edge < 0.0 ? -1e4 : edge / (blend.y * 0.4) - blend.w * 40.0;
}

void main() {
  vec4 edge = vec4(reach(uFar[0], uSideA[0], uSideB[0], uNear[0], uBlend[0]), reach(uFar[1], uSideA[1], uSideB[1], uNear[1], uBlend[1]),
    reach(uFar[2], uSideA[2], uSideB[2], uNear[2], uBlend[2]), reach(uFar[3], uSideA[3], uSideB[3], uNear[3], uBlend[3]));
  if (max(max(edge.x, edge.y), max(edge.z, edge.w)) <= 0.0) discard;
  vec4 cover = vec4(coverage(uNear[0], edge.x, uBlend[0]), coverage(uNear[1], edge.y, uBlend[1]),
    coverage(uNear[2], edge.z, uBlend[2]), coverage(uNear[3], edge.w, uBlend[3]));
  vec4 rank = vec4(preference(edge.x, uBlend[0]), preference(edge.y, uBlend[1]), preference(edge.z, uBlend[2]), preference(edge.w, uBlend[3]));
  vec4 weight = exp(rank - max(max(rank.x, rank.y), max(rank.z, rank.w))) * cover;
  vec4 sum = vec4(0.0);
  if (weight.x > 0.001) sum += sampleCamera(uTexture0, uInverse[0], uSource[0], uBlend[0]) * weight.x;
  if (weight.y > 0.001) sum += sampleCamera(uTexture1, uInverse[1], uSource[1], uBlend[1]) * weight.y;
  if (weight.z > 0.001) sum += sampleCamera(uTexture2, uInverse[2], uSource[2], uBlend[2]) * weight.z;
  if (weight.w > 0.001) sum += sampleCamera(uTexture3, uInverse[3], uSource[3], uBlend[3]) * weight.w;
  if (sum.a <= 0.0) discard;
  vec4 open = 1.0 - cover;
  float alpha = 1.0 - open.x * open.y * open.z * open.w;
  gl_FragColor = vec4(sum.rgb / sum.a * alpha, alpha);
}`;

interface Sector {
  texture: WebGLTexture; valid: boolean;
  source: string; time: number; ready: boolean;
}

export class SurroundView {
  private calibration = profileCalibration();
  private profileId = DEFAULT_PROFILE_ID;
  private profileOverrides: Record<string, Calibration> = {};
  private scene = document.createElement("div");
  private rig = document.createElement("div");
  private ground = document.createElement("div");
  private canvas = document.createElement("canvas");
  private car = new Image();
  private guides = document.createElement("div");
  private drawer = document.createElement("aside");
  private toolbar = document.createElement("div");
  private readout = document.createElement("div");
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private sectors = {} as Record<ExteriorCamera, Sector>;
  private inverses = new Float32Array(36);
  private edges = { uFar: new Float32Array(12), uSideA: new Float32Array(12), uNear: new Float32Array(12), uSideB: new Float32Array(12) };
  private planes = new Map<ExteriorCamera, HTMLElement>();
  private frame = 0;
  private visible = false;
  private size = 400;
  private tab: ExteriorCamera = "FRONT";
  private isolate = false;
  private suppressClick = false;

  constructor(private host: HTMLElement, private videos: Record<Camera, HTMLVideoElement>, private missing: (cam: ExteriorCamera) => boolean) {
    this.restoreCalibration();
    this.scene.className = "surround-scene"; this.scene.hidden = true;
    this.rig.className = "surround-rig"; this.ground.className = "surround-ground";
    this.canvas.className = "surround-canvas"; this.guides.className = "surround-guides";
    this.car.className = "surround-vehicle"; this.car.src = `${import.meta.env.BASE_URL}surround-vehicle.svg`; this.car.alt = "Top-down vehicle";
    this.toolbar.className = "surround-toolbar"; this.readout.className = "surround-readout";
    this.drawer.className = "surround-drawer"; this.drawer.hidden = true;
    this.drawer.setAttribute("aria-label", "Surround calibration");
    this.toolbar.innerHTML = `<select aria-label="Surround viewing angle">${ORBITS.map(([name], i) => `<option value="${i}">${name}</option>`).join("")}<option value="custom" hidden>Custom angle</option></select>
      <select aria-label="Surround style"><option value="factory">Factory</option><option value="tactical">Tactical</option><option value="cinematic">Cinematic</option></select>
      <button aria-label="Calibrate Surround 360" title="Calibrate Surround 360" aria-expanded="false">${icons.gear}</button>`;
    this.toolbar.querySelectorAll("select")[0].addEventListener("change", (event) => {
      const orbit = ORBITS[Number((event.target as HTMLSelectElement).value)];
      if (orbit) { this.calibration.pitch = orbit[1]; this.calibration.yaw = orbit[2]; this.calibration.zoom = 1; this.layout(); this.save(); }
    });
    this.toolbar.querySelectorAll("select")[1].addEventListener("change", (event) => {
      this.calibration.style = (event.target as HTMLSelectElement).value as Style; this.layout(); this.save();
    });
    this.toolbar.querySelector("button")!.addEventListener("click", () => this.toggleDrawer());
    for (const element of [this.toolbar, this.drawer]) {
      element.addEventListener("click", (event) => event.stopPropagation());
      element.addEventListener("dblclick", (event) => event.stopPropagation());
      element.addEventListener("pointerdown", (event) => event.stopPropagation());
      element.addEventListener("wheel", (event) => event.stopPropagation());
    }
    this.rig.append(this.ground, this.canvas, this.guides, this.car);
    this.scene.append(this.rig, this.toolbar, this.readout, this.drawer);
    host.append(this.scene);
    this.initGL(); this.buildDrawer(); this.bindOrbit();
    new ResizeObserver(() => this.visible && this.layout()).observe(host);
    this.scene.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.drawer.hidden) { event.stopPropagation(); this.toggleDrawer(false); }
    });
  }

  setVisible(visible: boolean) {
    if (visible === this.visible) { if (visible) this.layout(); return; }
    this.visible = visible; this.scene.hidden = !visible;
    cancelAnimationFrame(this.frame);
    if (!this.gl) this.moveFallbackTiles(visible);
    if (visible) {
      this.layout();
      const tick = () => { if (!this.visible) return; this.draw(); this.frame = requestAnimationFrame(tick); };
      tick();
    } else this.toggleDrawer(false);
  }

  /** Dragging and double-click reset must not also trigger player actions. */
  consumesClick() { const consumed = this.suppressClick; this.suppressClick = false; return consumed; }

  snapshot(): HTMLCanvasElement | null {
    if (!this.gl || !this.visible) return null;
    this.draw();
    const snapshot = document.createElement("canvas"); snapshot.width = this.canvas.width; snapshot.height = this.canvas.height;
    const context = snapshot.getContext("2d")!;
    context.fillStyle = this.ground.style.backgroundColor; context.fillRect(0, 0, snapshot.width, snapshot.height);
    context.drawImage(this.canvas, 0, 0);
    if (this.calibration.guides && this.calibration.style !== "cinematic") {
      context.strokeStyle = "#ffb369"; context.lineWidth = snapshot.width / 500; context.setLineDash([snapshot.width / 60, snapshot.width / 80]);
      const width = snapshot.width * this.calibration.carSize * 0.65;
      const height = snapshot.height * this.calibration.carSize * 1.4;
      context.strokeRect((snapshot.width - width) / 2, (snapshot.height - height) / 2, width, height);
    }
    if (this.car.complete && this.car.naturalWidth) {
      const height = snapshot.height * this.calibration.carSize, width = height * 400 / 1040;
      context.drawImage(this.car, (snapshot.width - width) / 2, (snapshot.height - height) / 2, width, height);
    }
    return snapshot;
  }

  private restoreCalibration() {
    try {
      const legacy: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
      const saved = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "null") as { selected?: string; overrides?: Record<string, unknown> } | null;
      if (saved && VEHICLE_PROFILES.some((profile) => profile.id === saved.selected)) {
        this.profileId = saved.selected!;
        for (const profile of VEHICLE_PROFILES) {
          if (saved.overrides?.[profile.id]) this.profileOverrides[profile.id] = normalize(saved.overrides[profile.id], profileCalibration(profile.id));
        }
        this.calibration = normalize(this.profileOverrides[this.profileId], profileCalibration(this.profileId));
      } else if (legacy && typeof legacy === "object") {
        // Existing users' unnamed calibration belongs to the original Tahoe defaults.
        this.profileId = TAHOE_PROFILE_ID;
        this.calibration = normalize(legacy, profileCalibration(TAHOE_PROFILE_ID));
        this.profileOverrides[this.profileId] = structuredClone(this.calibration);
      }
    } catch { /* default VISTIQ calibration */ }
  }

  private save() {
    this.profileOverrides[this.profileId] = structuredClone(this.calibration);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.calibration));
      localStorage.setItem(PROFILES_KEY, JSON.stringify({ selected: this.profileId, overrides: this.profileOverrides }));
    } catch { /* private mode or quota */ }
  }

  private chooseProfile(id: string) {
    if (!VEHICLE_PROFILES.some((profile) => profile.id === id)) return;
    this.save();
    const { pitch, yaw, zoom, style } = this.calibration;
    this.profileId = id;
    this.calibration = { ...normalize(this.profileOverrides[id], profileCalibration(id)), pitch, yaw, zoom, style };
    this.isolate = false; this.buildDrawer(); this.layout(); this.save();
    this.drawer.querySelector<HTMLSelectElement>(".surround-vehicle-profile")!.focus();
  }

  private initGL() {
    const gl = this.canvas.getContext("webgl", { alpha: true, antialias: true, depth: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    if (!gl) { this.useFallback(); return; }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) { this.useFallback(); return; }
    const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPos"); gl.linkProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); this.useFallback(); return; }
    this.gl = gl; this.program = program; this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(UNIT.flat()), gl.STATIC_DRAW);
    for (const name of ["uInverse", "uFar", "uSideA", "uSideB", "uNear", "uSource", "uBlend"]) this.uniforms[name] = gl.getUniformLocation(program, name);
    gl.useProgram(program);
    EXTERIOR.forEach((_, unit) => gl.uniform1i(gl.getUniformLocation(program, `uTexture${unit}`), unit));
    for (const cam of EXTERIOR) {
      const texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([16, 18, 22]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.sectors[cam] = { texture, valid: false, source: "", time: -1, ready: false };
    }
    this.canvas.addEventListener("webglcontextlost", (event) => { event.preventDefault(); this.useFallback(); this.layout(); });
  }

  private useFallback() {
    this.gl = null; this.canvas.hidden = true;
    if (!this.scene.querySelector(".surround-fallback-note")) {
      const note = document.createElement("div"); note.className = "surround-fallback-note";
      note.textContent = "Lens correction unavailable on this device"; this.scene.append(note);
    }
    if (this.visible) this.moveFallbackTiles(true);
  }

  private moveFallbackTiles(on: boolean) {
    for (const cam of EXTERIOR) {
      const tile = this.videos[cam].closest<HTMLElement>(".tile")!;
      if (on) {
        let plane = this.planes.get(cam);
        if (!plane) { plane = document.createElement("div"); plane.className = "surround-plane"; this.planes.set(cam, plane); this.rig.insertBefore(plane, this.guides); }
        plane.append(tile);
      } else { this.host.insertBefore(tile, this.scene); this.planes.get(cam)?.remove(); this.planes.delete(cam); }
    }
  }

  private layout() {
    const rectangle = this.host.getBoundingClientRect();
    this.size = Math.max(140, Math.min(rectangle.width, rectangle.height) * 0.9);
    const size = this.size, config = this.calibration;
    this.scene.dataset.style = config.style; this.scene.style.perspective = `${config.perspective * size}px`;
    this.rig.style.width = this.rig.style.height = `${size}px`;
    this.rig.style.transform = `translate(-50%, -50%) rotateX(${config.pitch}deg) rotateZ(${config.yaw}deg) scale(${config.zoom})`;
    const shade = [140, 150, 163].map((value, i) => Math.round(value + ([8, 11, 16][i] - value) * config.ground));
    this.ground.style.backgroundColor = `rgb(${shade.join(",")})`;
    this.car.style.height = `${config.carSize * 100}%`; this.car.style.width = `${config.carSize * 100 * 400 / 1040}%`;
    this.guides.hidden = !config.guides || config.style === "cinematic";
    this.guides.style.width = `${config.carSize * 65}%`; this.guides.style.height = `${config.carSize * 140}%`;
    const resolution = Math.max(256, Math.min(1600, Math.round(size * Math.min(devicePixelRatio || 1, 2))));
    if (this.canvas.width !== resolution) this.canvas.width = this.canvas.height = resolution;
    for (const cam of EXTERIOR) {
      const p = config.cams[cam], quad = groundQuad(cam, p);
      if (this.gl) {
        const index = EXTERIOR.indexOf(cam), lines = edgeLines(quad);
        Object.values(this.edges).forEach((edges, i) => edges.set(lines[i], index * 3));
        const sector = this.sectors[cam], inverse = solveHomography(quad, UNIT);
        sector.valid = !!inverse;
        if (inverse) {
          const center = quad.reduce((sum, [x, y]) => [sum[0] + x / 4, sum[1] + y / 4], [0, 0]);
          const sign = inverse[6] * center[0] + inverse[7] * center[1] + inverse[8] < 0 ? -1 : 1;
          this.inverses.set([inverse[0], inverse[3], inverse[6], inverse[1], inverse[4], inverse[7], inverse[2], inverse[5], inverse[8]].map((value) => value * sign), index * 9);
        }
      } else {
        const plane = this.planes.get(cam); if (!plane) continue;
        const map = solveHomography([[0, 0], [size, 0], [size, size], [0, size]], groundQuad(cam, p, size));
        plane.style.width = plane.style.height = `${size}px`; plane.style.transform = map ? cssHomography(map) : "none";
        plane.style.visibility = map ? "visible" : "hidden";
        const tile = this.videos[cam].closest<HTMLElement>(".tile")!;
        const height = size / Math.max(0.05, 1 - p.crop - (p.bottomCrop ?? 0)); tile.style.height = `${height}px`; tile.style.top = `${-p.crop * height}px`;
        const feather = clamp(p.feather * STYLE_FEATHER[config.style], 0.004, 0.45) * 100;
        plane.style.maskImage = `linear-gradient(to bottom, transparent, black ${feather}%), linear-gradient(to right, transparent, black ${feather}%, black ${100 - feather}%, transparent)`;
        plane.style.maskComposite = "intersect"; plane.style.opacity = this.isolate && cam !== this.tab ? "0.16" : "1";
      }
    }
    this.readout.textContent = `${this.profileId === TAHOE_PROFILE_ID ? "Tahoe Z71" : "VISTIQ"} · ${Math.round(config.pitch)}° tilt · ${Math.round(config.yaw)}° orbit · ${config.zoom.toFixed(2)}×`;
    const orbit = ORBITS.findIndex(([, pitch, yaw]) => Math.abs(pitch - config.pitch) < 0.6 && Math.abs(yaw - config.yaw) < 0.6);
    this.toolbar.querySelectorAll("select")[0].value = orbit < 0 ? "custom" : String(orbit);
    this.toolbar.querySelectorAll("select")[1].value = config.style;
  }

  private draw() {
    const gl = this.gl; if (!gl || !this.program) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const source = new Float32Array(16), blend = new Float32Array(16);
    EXTERIOR.forEach((cam, index) => {
      const sector = this.sectors[cam], video = this.videos[cam], p = this.calibration.cams[cam];
      const unavailable = this.missing(cam) || video.readyState < 2;
      gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, sector.texture);
      if (!unavailable && (!sector.ready || sector.source !== video.currentSrc || sector.time !== video.currentTime)) {
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video); sector.ready = true; sector.source = video.currentSrc; sector.time = video.currentTime; }
        catch { sector.ready = false; }
      }
      const height = video.videoHeight || 768;
      const cropHeight = Math.max(2, Math.floor(height * Math.max(0.05, 1 - p.crop - (p.bottomCrop ?? 0)) / 2) * 2);
      source.set([video.videoWidth || 1280, height, cropHeight, height - cropHeight - height * (p.bottomCrop ?? 0)], index * 4);
      // Edge blending is a fraction of the projected patch; FEATHER_SCALE converts it to ground-plate units.
      const feather = Math.max(0.002, clamp(p.feather * STYLE_FEATHER[this.calibration.style], 0, 0.45) * FEATHER_SCALE);
      const opacity = !sector.valid ? 0 : this.isolate && cam !== this.tab ? 0.16 : 1;
      blend.set([p.undistort, feather, opacity, unavailable || !sector.ready ? 1 : 0], index * 4);
    });
    gl.uniformMatrix3fv(this.uniforms.uInverse, false, this.inverses);
    for (const [name, edges] of Object.entries(this.edges)) gl.uniform3fv(this.uniforms[name], edges);
    gl.uniform4fv(this.uniforms.uSource, source); gl.uniform4fv(this.uniforms.uBlend, blend);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  }

  private bindOrbit() {
    let drag: { x: number; y: number; pitch: number; yaw: number; moved: boolean } | null = null;
    this.scene.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, pitch: this.calibration.pitch, yaw: this.calibration.yaw, moved: false };
      this.scene.setPointerCapture(event.pointerId);
    });
    this.scene.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.moved) return;
      drag.moved = true; this.suppressClick = true;
      this.calibration.yaw = ((drag.yaw + dx * 0.4) % 360 + 360) % 360;
      this.calibration.pitch = clamp(drag.pitch + dy * 0.3, 0, 70); this.layout();
    });
    const end = () => { if (drag?.moved) this.save(); drag = null; };
    this.scene.addEventListener("pointerup", end); this.scene.addEventListener("pointercancel", end);
    this.scene.addEventListener("wheel", (event) => { event.preventDefault(); this.calibration.zoom = clamp(this.calibration.zoom * Math.exp(-event.deltaY * 0.0014), 0.6, 2.2); this.layout(); this.save(); }, { passive: false });
    this.scene.addEventListener("dblclick", (event) => { event.stopPropagation(); this.calibration.pitch = this.calibration.yaw = 0; this.calibration.zoom = 1; this.layout(); this.save(); });
  }

  private toggleDrawer(open = this.drawer.hidden) {
    const wasOpen = !this.drawer.hidden;
    this.drawer.hidden = !open; this.toolbar.querySelector("button")!.setAttribute("aria-expanded", String(open));
    if (open) this.drawer.querySelector<HTMLButtonElement>(".surround-close")?.focus();
    else if (wasOpen && this.visible) this.toolbar.querySelector("button")!.focus();
  }

  private buildDrawer() {
    const label = (cam: string) => cam[0] + cam.slice(1).toLowerCase();
    this.drawer.innerHTML = `<div class="surround-drawer-head"><strong>Surround calibration</strong><button class="surround-close" aria-label="Close calibration">×</button></div>
      <label class="surround-profile-label">Vehicle profile<select class="surround-vehicle-profile" aria-label="Vehicle calibration">${VEHICLE_PROFILES.map((profile) => `<option value="${profile.id}" ${profile.id === this.profileId ? "selected" : ""}>${profile.name}</option>`).join("")}</select></label>
      <p>${VEHICLE_PROFILES.find((profile) => profile.id === this.profileId)!.description} Adjustments are saved separately for each vehicle on this device.</p>
      <select class="surround-calibration-camera" aria-label="Camera to calibrate">${EXTERIOR.map((cam) => `<option value="${cam}" ${cam === this.tab ? "selected" : ""}>${label(cam)}</option>`).join("")}</select>
      <label class="surround-check"><input type="checkbox" data-isolate ${this.isolate ? "checked" : ""}> Isolate this camera</label>
      ${PARAMS.map(([key, name, min, max]) => this.slider(key, name, min, max, this.calibration.cams[this.tab][key] ?? 0, "camera")).join("")}
      <h4>Ground and vehicle</h4>${GLOBALS.map(([key, name, min, max]) => this.slider(key, name, min, max, this.calibration[key], "global")).join("")}
      <label class="surround-check"><input type="checkbox" data-guides ${this.calibration.guides ? "checked" : ""}> Show parking guides</label>
      <h4>Calibration presets</h4><select aria-label="Calibration preset slot" class="surround-slot">${[1, 2, 3, 4].map((slot) => `<option value="${slot - 1}">Preset ${slot}</option>`).join("")}</select>
      <div class="surround-preset-actions"><button data-preset="save">Save</button><button data-preset="load">Load</button><button data-preset="clear">Clear</button></div>
      <p class="surround-preset-status" role="status"></p><button class="surround-reset">Reset calibration</button>
      <p class="surround-note">The projection assumes flat ground. Reset restores the selected vehicle's built-in calibration.</p>`;
    this.drawer.querySelector(".surround-close")!.addEventListener("click", () => this.toggleDrawer(false));
    this.drawer.querySelector<HTMLSelectElement>(".surround-vehicle-profile")!.addEventListener("change", (event) => this.chooseProfile((event.target as HTMLSelectElement).value));
    this.drawer.querySelector<HTMLSelectElement>(".surround-calibration-camera")!.addEventListener("change", (event) => {
      this.tab = (event.target as HTMLSelectElement).value as ExteriorCamera; this.buildDrawer(); this.layout();
      this.drawer.querySelector<HTMLSelectElement>(".surround-calibration-camera")!.focus();
    });
    this.drawer.querySelector<HTMLInputElement>("[data-isolate]")!.addEventListener("change", (event) => { this.isolate = (event.target as HTMLInputElement).checked; this.layout(); });
    this.drawer.querySelector<HTMLInputElement>("[data-guides]")!.addEventListener("change", (event) => { this.calibration.guides = (event.target as HTMLInputElement).checked; this.layout(); this.save(); });
    this.drawer.querySelectorAll<HTMLInputElement>("input[type=range]").forEach((input) => input.addEventListener("input", () => {
      const value = Number(input.value), key = input.dataset.key!;
      if (input.dataset.kind === "camera") this.calibration.cams[this.tab][key as keyof CameraCalibration] = value;
      else this.calibration[key as "perspective" | "carSize" | "ground"] = value;
      input.closest("label")!.querySelector("output")!.textContent = value.toFixed(2); this.layout(); this.save();
    }));
    this.drawer.querySelector(".surround-reset")!.addEventListener("click", () => {
      const { pitch, yaw, zoom, style } = this.calibration; this.calibration = { ...profileCalibration(this.profileId), pitch, yaw, zoom, style };
      this.isolate = false; this.buildDrawer(); this.layout(); this.save();
    });
    this.drawer.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((button) => button.addEventListener("click", () => {
      const slot = Number(this.drawer.querySelector<HTMLSelectElement>(".surround-slot")!.value);
      let presets: unknown[] = [];
      try { const saved: unknown = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]"); if (Array.isArray(saved)) presets = saved.slice(0, 4); } catch { /* empty slots */ }
      const status = this.drawer.querySelector<HTMLElement>(".surround-preset-status")!;
      if (button.dataset.preset === "load") {
        if (!presets[slot]) { status.textContent = "This slot is empty."; return; }
        const { pitch, yaw, zoom, style } = this.calibration; this.calibration = { ...normalize(presets[slot], profileCalibration(this.profileId)), pitch, yaw, zoom, style };
        this.buildDrawer(); this.drawer.querySelector<HTMLSelectElement>(".surround-slot")!.value = String(slot); this.layout(); this.save();
        this.drawer.querySelector<HTMLElement>(".surround-preset-status")!.textContent = `Loaded preset ${slot + 1}.`;
      } else {
        presets[slot] = button.dataset.preset === "save" ? this.calibration : null;
        try { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); status.textContent = `${button.dataset.preset === "save" ? "Saved" : "Cleared"} preset ${slot + 1}.`; }
        catch { status.textContent = "Unable to save presets on this device."; }
      }
    }));
  }

  private slider(key: string, name: string, min: number, max: number, value: number, kind: string) {
    return `<label class="surround-slider"><span>${name}<output>${value.toFixed(2)}</output></span><input type="range" data-key="${key}" data-kind="${kind}" min="${min}" max="${max}" step="0.01" value="${value}"></label>`;
  }
}
