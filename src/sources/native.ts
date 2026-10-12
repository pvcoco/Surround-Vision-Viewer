// Desktop (Electron) source: the main process scans drives and serves files over
// svr://app/@file/ (same origin as the app) with HTTP range support, so <video> can seek.

import type { RecFile } from "../recordings";
import type { LoadedSource } from "./web";

export interface RecorderDir {
  path: string;
  label: string;
}

interface NativeApi {
  platform: string;
  findRecorderDirs(): Promise<RecorderDir[]>;
  pickFolder(): Promise<(RecorderDir & { empty?: boolean }) | null>;
  list(dir: string): Promise<{ name: string; size: number; path: string }[]>;
  onDrivesChanged(cb: () => void): void;
}

export const native: NativeApi | undefined = (window as any).svrNative;

export function fileUrl(path: string): string {
  return `svr://app/@file/${encodeURIComponent(path)}`;
}

export async function loadNativeDir(dir: RecorderDir): Promise<LoadedSource> {
  const entries = await native!.list(dir.path);
  const files: RecFile[] = entries.map((e) => {
    const url = fileUrl(e.path);
    return {
      name: e.name,
      size: e.size,
      url: async () => url,
      read: async (start, end) => {
        const res = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
        return res.arrayBuffer();
      },
    };
  });
  return { label: dir.label, files };
}
