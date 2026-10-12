---
name: viewer-playback
description: Change or debug Surround Vision Viewer recording import, segment grouping, synchronized playback, snapshots, keyboard controls, or calendar and day filtering.
---

# Viewer playback and recording navigation

All paths below are relative to the repository root. Trace the affected flow from
`src/sources/web.ts` or `src/sources/native.ts` through `src/recordings.ts`,
`src/mp4.ts`, `src/player.ts`, and `src/main.ts`. For date navigation, read
`src/recording-days.ts` and `src/day-picker.ts`.

## Recording model

- `RecFile` abstracts URL creation and byte-range reads for both file sources.
  Obtain duration from MP4 headers; avoid loading entire large videos just to
  determine their length. Recorder files may have the `moov` atom at the end.
- Filenames contain local wall-clock timestamps. Build calendar keys with local
  date components, not `toISOString()`. Keep local-day and DST cases covered.
- `groupEvents` joins continuous five-minute rollovers and optionally short gaps.
  Event timeline offsets sum video durations; a merged real-world gap does not
  insert blank playback time. Read existing tolerances before changing them.
- Calendar availability uses each segment's start day, so an event with segments
  starting on multiple days appears on each of those days. Preserve that behavior
  unless the requested change explicitly redefines it.

## Playback and UI invariants

Use the existing `Player` elements and clock for single, quad, and Surround views.
Maintain event-relative seeking, camera handover, playback speed, missing-camera
handling, and stale asynchronous load cancellation. Composite views synchronize
the exterior cameras; cabin footage is not a surround surface.

Browsing calendar days keeps the current recording playing. Selecting a recording
changes playback. Previous/next recorded-day controls skip empty days; recording
navigation and auto-advance use the current filtered list. Show all recordings
restores grouped day headings.

Controls inside the calendar or calibration drawer must keep normal keyboard
behavior without triggering global player shortcuts. Preserve accessible names,
pressed states, focus, Escape handling, and mobile layouts. A rerender can detach
the clicked element before a document-level outside-click handler runs; account
for the original event path when necessary.

Single and quad snapshots capture the visible camera layout. Surround snapshots
use its compositor. Saving original clips in a composite mode saves available
exterior camera files for the current segment.

## Validate the affected flow

Run relevant Vitest files and `npm run build`. For playback changes, import a
multi-segment recording and check seeking across a boundary, automatic rollover,
camera/mode switching, and a missing-camera case. Use real files for decoder
claims; synthetic fixtures are useful for deterministic dates and camera labels.

For calendar changes, check newest-day selection, empty dates, recorded-day
arrows, all-recordings mode, keyboard navigation, and playback continuing while
browsing. For export changes, open the generated image or verify downloaded file
selection. Report browser/desktop coverage separately and keep private media out
of tracked fixtures.
