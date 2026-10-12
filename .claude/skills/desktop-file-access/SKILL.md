---
name: desktop-file-access
description: Change or debug Surround Vision Viewer's Electron drive discovery, folder selection, preload IPC, svr protocol video streaming, or desktop packaging.
---

# Desktop file access

All paths below are relative to the repository root. Read `electron/main.cjs`,
`electron/preload.cjs`, and `src/sources/native.ts` for the affected operation.
Read `package.json` for packaging and `vite.config.ts` for asset paths.

## File discovery and access

The recorder directory beneath a drive root is:

```text
Android/media/com.gm.ultifi.gmconnectedcameraservice/Recordings/SurroundVisionRecorder
```

Use discovered drives or the user's chosen folder. Preserve support for choosing
the root, the recorder directory, or a parent between them. Do not hardcode a
machine's drive letter. Source recordings are read-only inputs.

Windows probes drive letters with timeouts and tracks unresolved probes so a
disconnected drive cannot accumulate duplicate filesystem work. Scans share an
in-flight promise, and polling waits for each scan to finish. Preserve those
properties when changing detection. Inspect the separate macOS/Linux mount-root
logic before making cross-platform claims.

## Renderer and protocol boundary

Keep `contextIsolation` and the renderer sandbox enabled. Expose only the needed
operations through `svrNative`; validate filesystem access in the main process.
The allowlist contains discovered or user-selected recorder directories. Avoid
expanding a requested fix into arbitrary renderer filesystem access.

The `svr://app/` origin serves built assets and authorized recording files.
Maintain path containment, URL decoding, MIME types, and streaming HTTP range
responses so seeking does not download whole MP4 files. Verify range boundaries,
suffix ranges, invalid ranges, and disallowed paths when changing this handler.
The common origin also permits video frames to be drawn into snapshot canvases.

## Build and verify

Run `npm run build` before launching Electron; it serves `dist/`, not the Vite
development source. Exercise discovery or folder selection, file import, seeking,
thumbnails, and snapshot export for changes that affect native file access.
Browser-only checks cannot validate the preload bridge or native protocol.

For packaging changes, use the appropriate `npm run dist:*` target and inspect
the packaged assets, including `public/third-party-notices.txt` as copied into
`dist/`. Keep artifacts in ignored `release/`. Report which operating systems
were actually exercised; building one target is not a test of all three platforms.

When useful, the existing `SVR_SCREENSHOT`, `SVR_SCREENSHOT_DELAY`, and `SVR_EVAL`
environment hooks support an automated Electron smoke run. Inspect their current
implementation before using them; use temporary output paths and scoped process
environment variables. Keep private captures outside the repository.
