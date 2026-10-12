// Grabs a small still from each event's front camera for the list, one at a time
// so a large card doesn't spin up dozens of decoders at once.

import type { RecFile } from "./recordings";

const cache = new Map<RecFile, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

export function thumbnail(file: RecFile): Promise<string | null> {
  let p = cache.get(file);
  if (!p) {
    p = queue.then(() => capture(file));
    queue = p.catch(() => null);
    cache.set(file, p);
  }
  return p;
}

async function capture(file: RecFile): Promise<string | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    video.src = await file.url();
    await once(video, "loadeddata");
    video.currentTime = Math.min(1, (video.duration || 2) / 2);
    await once(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = Math.round((240 * video.videoHeight) / (video.videoWidth || 1)) || 144;
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

function once(target: HTMLVideoElement, type: string, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("timeout")), timeoutMs);
    const ok = () => finish();
    const fail = () => finish(new Error("video error"));
    function finish(err?: Error) {
      clearTimeout(timer);
      target.removeEventListener(type, ok);
      target.removeEventListener("error", fail);
      err ? reject(err) : resolve();
    }
    target.addEventListener(type, ok);
    target.addEventListener("error", fail);
  });
}
