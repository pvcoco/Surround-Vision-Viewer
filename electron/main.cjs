// Electron shell: serves the built web app and recordings from svr://app/ (one origin,
// so thumbnails can be drawn to canvas), scans removable drives for the GM recorder
// folder, and notifies the renderer when drives come and go.

const { app, BrowserWindow, protocol, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { Readable } = require("node:stream");

const RECORDER_PATH = ["Android", "media", "com.gm.ultifi.gmconnectedcameraservice", "Recordings", "SurroundVisionRecorder"];
const NAME_RE = /^[A-Za-z]+_\d{4}_\d{2}_\d{2}_T_\d{2}_\d{2}_\d{2}\.mp4$/i;
const DIST = path.join(__dirname, "..", "dist");
const FILE_PREFIX = "/@file/";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
};

protocol.registerSchemesAsPrivileged([
  { scheme: "svr", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

/** Directories the renderer is allowed to read from. */
const allowedDirs = new Set();
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }, null, 2));
}

async function isDir(p) {
  try {
    return (await fsp.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function hasRecordings(dir) {
  try {
    return (await fsp.readdir(dir)).some((n) => NAME_RE.test(n));
  } catch {
    return false;
  }
}

/** Drive roots whose stat hasn't returned yet (e.g. a disconnected network drive). */
const pendingRoots = new Map();
const ROOT_TIMEOUT_MS = 1000;

/**
 * Checks a drive root without letting an unresponsive drive stall the scan. A stuck
 * stat holds a libuv thread, so a root is never probed again while one is in flight.
 */
function rootExists(root) {
  let probe = pendingRoots.get(root);
  if (!probe) {
    probe = isDir(root).finally(() => pendingRoots.delete(root));
    pendingRoots.set(root, probe);
  }
  return Promise.race([probe, new Promise((resolve) => setTimeout(resolve, ROOT_TIMEOUT_MS, false))]);
}

async function driveRoots() {
  if (process.platform === "win32") {
    const roots = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => `${l}:\\`);
    const found = await Promise.all(roots.map(async (r) => ((await rootExists(r)) ? r : null)));
    return found.filter(Boolean);
  }
  const parents =
    process.platform === "darwin"
      ? ["/Volumes"]
      : [`/media/${os.userInfo().username}`, "/media", `/run/media/${os.userInfo().username}`, "/mnt"];
  const roots = [];
  for (const parent of parents) {
    try {
      for (const name of await fsp.readdir(parent)) roots.push(path.join(parent, name));
    } catch {}
  }
  return roots;
}

function labelFor(dir) {
  if (process.platform === "win32") return dir.slice(0, 2).toUpperCase();
  const parts = dir.split(path.sep).filter(Boolean);
  const i = parts.indexOf("Android");
  return i > 0 ? parts[i - 1] : path.basename(dir);
}

/** Resolves a user-chosen folder (drive root, recorder folder, or anything between). */
async function resolveRecorderDir(chosen) {
  for (let i = 0; i < RECORDER_PATH.length; i++) {
    const p = path.join(chosen, ...RECORDER_PATH.slice(i));
    if (await hasRecordings(p)) return p;
  }
  return (await hasRecordings(chosen)) ? chosen : null;
}

let scanInFlight = null;

/** Scans all drives; concurrent callers share one scan. */
function findRecorderDirs() {
  scanInFlight ??= scanRecorderDirs().finally(() => (scanInFlight = null));
  return scanInFlight;
}

async function scanRecorderDirs() {
  const dirs = [];
  for (const root of await driveRoots()) {
    const p = path.join(root, ...RECORDER_PATH);
    if (await isDir(p)) dirs.push({ path: p, label: labelFor(p) });
  }
  const last = readSettings().lastFolder;
  if (last && !dirs.some((d) => d.path === last) && (await isDir(last))) {
    dirs.push({ path: last, label: path.basename(path.dirname(last)) || last });
  }
  dirs.forEach((d) => allowedDirs.add(path.resolve(d.path)));
  return dirs;
}

function isAllowed(file) {
  const resolved = path.resolve(file);
  return NAME_RE.test(path.basename(resolved)) && allowedDirs.has(path.dirname(resolved));
}

async function serveFile(file, request) {
  const stat = await fsp.stat(file);
  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") || "");
  if (!range) {
    return new Response(Readable.toWeb(fs.createReadStream(file)), {
      headers: { "Content-Type": type, "Content-Length": String(stat.size), "Accept-Ranges": "bytes" },
    });
  }
  let start = range[1] ? Number(range[1]) : 0;
  let end = range[2] ? Number(range[2]) : stat.size - 1;
  if (!range[1] && range[2]) {
    start = Math.max(0, stat.size - Number(range[2]));
    end = stat.size - 1;
  }
  end = Math.min(end, stat.size - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
    status: 206,
    headers: {
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
    },
  });
}

function registerProtocol() {
  protocol.handle("svr", async (request) => {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith(FILE_PREFIX)) {
        const file = decodeURIComponent(url.pathname.slice(FILE_PREFIX.length));
        if (!isAllowed(file)) return new Response("Forbidden", { status: 403 });
        return await serveFile(file, request);
      }
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = path.join(DIST, path.normalize(rel));
      if (!file.startsWith(DIST)) return new Response("Forbidden", { status: 403 });
      return await serveFile(file, request);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function registerIpc() {
  ipcMain.handle("svr:find", () => findRecorderDirs());
  ipcMain.handle("svr:pick", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win, {
      title: "Choose the flash drive or SurroundVisionRecorder folder",
      properties: ["openDirectory"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const dir = await resolveRecorderDir(res.filePaths[0]);
    if (!dir) return { path: res.filePaths[0], label: path.basename(res.filePaths[0]), empty: true };
    allowedDirs.add(path.resolve(dir));
    writeSettings({ lastFolder: dir });
    return { path: dir, label: labelFor(dir) };
  });
  ipcMain.handle("svr:list", async (_e, dir) => {
    if (!allowedDirs.has(path.resolve(dir))) return [];
    const names = (await fsp.readdir(dir)).filter((n) => NAME_RE.test(n));
    return Promise.all(
      names.map(async (name) => {
        const p = path.join(dir, name);
        return { name, path: p, size: (await fsp.stat(p)).size };
      }),
    );
  });
}

function watchDrives(win) {
  let last = "";
  let timer;
  // Each scan starts 4 s after the previous one finishes, so slow drives can't pile up scans.
  const tick = async () => {
    const dirs = JSON.stringify((await findRecorderDirs()).map((d) => d.path));
    if (win.isDestroyed()) return;
    if (last && dirs !== last) win.webContents.send("svr:drives-changed");
    last = dirs;
    timer = setTimeout(tick, 4000);
  };
  tick();
  win.on("closed", () => clearTimeout(timer));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: "#03050a",
    autoHideMenuBar: true,
    title: "Surround Vision Viewer",
    icon: path.join(DIST, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL("svr://app/index.html");
  watchDrives(win);

  // Used for automated smoke tests: SVR_SCREENSHOT=out.png electron .
  if (process.env.SVR_SCREENSHOT) {
    win.webContents.on("console-message", (e) => console.log(`[renderer] ${e.message}`));
    setTimeout(async () => {
      if (process.env.SVR_EVAL) console.log("[eval]", JSON.stringify(await win.webContents.executeJavaScript(process.env.SVR_EVAL)));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SVR_SCREENSHOT, img.toPNG());
      app.quit();
    }, Number(process.env.SVR_SCREENSHOT_DELAY || 8000));
  }
}

app.whenReady().then(() => {
  registerProtocol();
  registerIpc();
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());
