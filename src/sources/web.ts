// Browser file sources: File System Access API directory handles (Chromium),
// <input webkitdirectory> file lists, and drag & drop.

import { parseName, type RecFile } from "../recordings";

export const RECORDER_PATH = [
  "Android",
  "media",
  "com.gm.ultifi.gmconnectedcameraservice",
  "Recordings",
  "SurroundVisionRecorder",
];

export interface LoadedSource {
  label: string;
  files: RecFile[];
}

function fileToRec(file: File): RecFile {
  let url: string | null = null;
  return {
    name: file.name,
    size: file.size,
    url: async () => (url ??= URL.createObjectURL(file)),
    read: (start, end) => file.slice(start, end).arrayBuffer(),
  };
}

function isRecording(name: string): boolean {
  return parseName(name) !== null;
}

// ---- File System Access API ----

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(opts: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" }): Promise<PermissionState>;
};

export const supportsDirectoryPicker = typeof (window as any).showDirectoryPicker === "function";

export async function pickDirectory(): Promise<DirHandle> {
  return (window as any).showDirectoryPicker({ id: "svr-recordings", mode: "read" });
}

async function listRecordings(dir: DirHandle): Promise<FileSystemFileHandle[]> {
  const out: FileSystemFileHandle[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind === "file" && isRecording(entry.name)) out.push(entry as FileSystemFileHandle);
  }
  return out;
}

async function descend(dir: DirHandle, parts: string[]): Promise<DirHandle | null> {
  let cur = dir;
  for (const part of parts) {
    try {
      cur = (await cur.getDirectoryHandle(part)) as DirHandle;
    } catch {
      return null;
    }
  }
  return cur;
}

/**
 * Accepts the recordings folder itself, the drive root, or any folder along the
 * recorder path, and finds the recordings inside it.
 */
export async function loadFromDirectory(root: DirHandle): Promise<LoadedSource> {
  const candidates: DirHandle[] = [root];
  for (let i = 0; i < RECORDER_PATH.length; i++) {
    const d = await descend(root, RECORDER_PATH.slice(i));
    if (d) candidates.unshift(d);
  }
  for (const dir of candidates) {
    const handles = await listRecordings(dir);
    if (!handles.length) continue;
    const files = await Promise.all(handles.map((h) => h.getFile()));
    return { label: root.name, files: files.map(fileToRec) };
  }
  return { label: root.name, files: [] };
}

// ---- persisted handle (IndexedDB) ----

const DB = "svr-viewer";
const STORE = "handles";

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

export const saveHandle = (h: DirHandle) => idb("readwrite", (s) => s.put(h, "root")).catch(() => {});
export const loadHandle = () => idb<DirHandle | undefined>("readonly", (s) => s.get("root")).catch(() => undefined);

/** Returns "granted" if the stored handle can be read now, "prompt" if it needs a click. */
export async function handlePermission(h: DirHandle, request: boolean): Promise<PermissionState> {
  const opts = { mode: "read" as const };
  if ((await h.queryPermission?.(opts)) === "granted") return "granted";
  if (!request) return "prompt";
  return (await h.requestPermission?.(opts)) ?? "denied";
}

// ---- plain file lists (webkitdirectory input, multi-select, drop) ----

export function loadFromFileList(list: Iterable<File>, label = "Selected files"): LoadedSource {
  const files = [...list].filter((f) => isRecording(f.name));
  // A drive root can contain copies in several folders; prefer the recorder folder.
  const preferred = files.filter((f) => (f.webkitRelativePath || "").includes("SurroundVisionRecorder"));
  const chosen = preferred.length ? preferred : files;
  const first = chosen[0]?.webkitRelativePath?.split("/")[0];
  return { label: first || label, files: chosen.map(fileToRec) };
}

export async function loadFromDrop(dt: DataTransfer): Promise<LoadedSource | null> {
  const items = [...dt.items].filter((i) => i.kind === "file");
  // Chromium: real directory handles, which can also be persisted.
  const withHandle = items[0] as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };
  if (items.length === 1 && withHandle.getAsFileSystemHandle) {
    const handle = await withHandle.getAsFileSystemHandle();
    if (handle?.kind === "directory") {
      await saveHandle(handle as DirHandle);
      return loadFromDirectory(handle as DirHandle);
    }
  }
  // Everyone else: walk legacy FileSystemEntry trees.
  const entries = items.map((i) => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return null;
  const files: File[] = [];
  await Promise.all(entries.map((e) => collectEntry(e, files)));
  return loadFromFileList(files, entries[0].name);
}

async function collectEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    if (!isRecording(entry.name)) return;
    out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    await Promise.all(batch.map((e) => collectEntry(e, out)));
  }
}
