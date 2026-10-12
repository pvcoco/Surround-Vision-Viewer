# Surround Vision Viewer: agent instructions

This file is the shared project guidance for Codex and Claude Code. `CLAUDE.md`
imports it. Keep project rules here and load the focused skills below as needed.

## Project and architecture

Surround Vision Viewer reads GM Surround Vision Recorder files locally and presents
them in a Cadillac-style interface. It is a static TypeScript/Vite app and an
Electron desktop app sharing the same renderer. There is no backend or runtime
framework dependency. Preserve local playback, offline use, and sub-path hosting.

| Area | Files |
| --- | --- |
| UI, controls, exports, shortcuts | `src/main.ts`, `src/styles.css`, `src/icons.ts` |
| Playback, segment transitions, camera synchronization | `src/player.ts` |
| Filename parsing, event grouping, MP4 duration probing | `src/recordings.ts`, `src/mp4.ts` |
| Day filtering and calendar | `src/recording-days.ts`, `src/day-picker.ts`, `src/day-picker.css` |
| Surround rendering, geometry, vehicle profiles | `src/surround.ts`, `src/surround-geometry.ts`, `src/surround-profiles.ts`, `src/surround.css` |
| File access | `src/sources/web.ts`, `src/sources/native.ts` |
| Desktop protocol, drive discovery, renderer bridge | `electron/main.cjs`, `electron/preload.cjs` |
| Preferences and thumbnails | `src/settings.ts`, `src/thumbs.ts` |
| Static assets and offline support | `public/`, `public/sw.js` |

Read `README.md` for user behavior and `docs/surround-calibration.md` for vehicle
calibration provenance. Follow the existing plain TypeScript and CSS conventions;
keep pure parsing/geometry logic independent of the DOM where practical.

## Commands and validation

Use Node.js 22 or newer and npm. `package-lock.json` is the dependency lockfile.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install locked dependencies in a fresh checkout |
| `npm run dev` | Start Vite for browser development |
| `npm test` | Run Vitest tests |
| `npm run build` | Type-check and build the static app into `dist/` |
| `npm run electron` | Build and launch the desktop app |
| `npm run dist:win` | Build Windows installers and portable executable into `release/` |
| `npm run dist:mac` / `npm run dist:linux` | Build for the corresponding platform |

For application changes, run relevant tests and the production build. For visible
behavior changes, exercise the affected browser or desktop flow; unit tests alone
do not establish that video decoding, WebGL rendering, or native file access works.
Documentation-only changes need link/content checks, not a full app test cycle.
Report what was actually checked and any unavailable platform or footage.

Keep generated builds, diagnostic captures, temporary tooling, and private media
out of commits. Do not add dependencies solely for a one-off diagnostic if tools
already available in the environment can do the job.

## Product constraints

- Read source recordings without modifying them. Videos stay on the user's device;
  do not introduce uploads, analytics, or remote processing into the playback flow.
- Filename timestamps are vehicle-local wall time. Preserve local date grouping;
  UTC conversion can put a recording on the wrong calendar day.
- Single, four-camera, and Surround modes share `Player` video elements and its
  event timeline. Preserve playback position and synchronization when switching.
- Preserve the original **2025 Chevrolet Tahoe Z71** calibration from
  GMSurroundVision. Keep **2026 Cadillac VISTIQ** and additional vehicles in separate
  named profiles. Retain saved user adjustments and migration behavior.
- Surround projection assumes flat ground. Visual tuning is not factory or metric
  calibration; elevated objects can distort at seams.
- Keep the Electron renderer sandboxed and context-isolated. File access goes
  through the narrow preload bridge and authorized recorder directories.
- Retain third-party MIT attribution in both `THIRD_PARTY_NOTICES.md` and
  `public/third-party-notices.txt` when changing adapted code or assets.

## Git and publication

Inspect the working tree before editing; preserve work already present. Commit or
push when requested or already authorized for the current work. A push to `main`
triggers `.github/workflows/pages.yml` to test, build, and publish GitHub Pages.

For commits made on Patrick's behalf, use **Patrick Coco** and
**pvcoco@users.noreply.github.com** for both author and committer. Do not add AI
co-author trailers or generated-by attribution. Prefer a per-command override to
changing global Git configuration:

```sh
git -c user.name="Patrick Coco" -c user.email="pvcoco@users.noreply.github.com" commit -m "Describe the change"
```

Verify author, committer, and trailers when committing, especially if environment
variables override Git configuration. Do not rewrite existing history merely to
refresh GitHub's cached contributor display; history changes need task-specific
authorization.

## Project skills

Canonical instructions live in `.claude/skills/`. Codex discovers the matching
entry files in `.agents/skills/`, which direct it to read the canonical skill.
These are ordinary files, so Windows checkouts need no symlink support or setup.
Use repository-relative paths inside shared skill instructions.

| Skill | Use when |
| --- | --- |
| [surround-calibration](.claude/skills/surround-calibration/SKILL.md) | Tuning projection, testing vehicle footage, or adding vehicle profiles |
| [viewer-playback](.claude/skills/viewer-playback/SKILL.md) | Changing recording grouping, playback, exports, or date navigation |
| [desktop-file-access](.claude/skills/desktop-file-access/SKILL.md) | Changing Electron drive discovery, IPC, protocol streaming, or packaging |

Edit workflow instructions in the canonical skill only. If its name or description
changes, update its Codex entry too. Each entry requires YAML `name` and
`description` followed by Markdown. Keep the conventional filename casing
`AGENTS.md`, `CLAUDE.md`, and `SKILL.md` for case-sensitive platforms.

Discovery references: [Codex skills](https://developers.openai.com/codex/skills/),
[Claude Code skills](https://code.claude.com/docs/en/skills), and
[CLAUDE.md imports](https://code.claude.com/docs/en/memory#import-additional-files).
