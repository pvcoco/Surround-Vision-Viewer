---
name: surround-calibration
description: Tune Surround Vision Viewer camera projection against local footage, add vehicle calibration profiles, or change surround geometry and saved calibration behavior.
---

# Surround calibration

All code and documentation paths below are relative to the repository root.
Read `docs/surround-calibration.md`, `src/surround-profiles.ts`, and the relevant
parts of `src/surround-geometry.ts` and `src/surround.ts` before changing calibration.

## Establish the baseline

- Keep the GMSurroundVision source settings under **2025 Chevrolet Tahoe Z71**.
  Their provenance is recorded in `THIRD_PARTY_NOTICES.md`. New vehicle tuning
  belongs in a separate named profile; preserve the original values.
- The **2026 Cadillac VISTIQ** is the fresh-install default. Built-in templates
  are copied by `profileCalibration`; saved edits are separate per vehicle.
- Inspect footage dimensions, camera coverage, and segment timestamps. Use the
  user's supplied location; a drive letter or previous sample count is not fixed.
  If footage is unavailable, complete independent code work and state that visual
  tuning cannot yet be validated.

## Tune with comparable frames

Use synchronized frames from all four exterior cameras. Compare baseline and
candidate at identical timestamps and viewing angles across several segments,
including parked and moving scenes when available. Keep diagnostic images local
and outside the repository unless the user asks to include them.

Tune against ground features such as pavement joints, lane lines, curbs, and grass
boundaries. Nearby buildings and vehicles rise above the assumed ground plane and
cannot be made geometrically correct by matching their silhouettes at seams.

Distinguish horizon crop from bottom vehicle-body trim. Patch dimensions and
position are fractions of the square ground canvas, not meters. Side-camera
offsets use each camera's local near-edge axis; opposite signs can move both side
patches toward the front. Change a small set of parameters at a time and inspect
coverage gaps, overlap, and distortion before accepting the result.

## Preserve integration

- Keep geometry math, shader sampling, and CSS fallback cropping consistent.
  CSS fallback omits lens correction and must restore the original video tiles
  when leaving Surround mode.
- Normalize persisted values using the selected profile's defaults. Keep legacy
  unnamed calibration migration to Tahoe, per-vehicle overrides, four custom
  preset slots, and reset behavior intact.
- Profile switching preserves view angle, zoom, and style. Reset restores the
  selected vehicle's built-in geometry without erasing another vehicle's edits.
- Surround snapshots render the calibrated top-down composite, even from an
  orbit view. Keep the existing shared Player video elements and playback clock.

## Validate and document

Run `npm test -- tests/surround-geometry.test.ts tests/surround-profiles.test.ts`
and `npm run build`. For projection changes, also inspect real rendered frames,
mode switching, profile/reset/reload behavior, missing cameras, snapshots, and
playback across a segment boundary. Exercise CSS fallback when its code changes.

Update `docs/surround-calibration.md` with profile provenance, tuning rationale,
footage coverage, and limitations. Distinguish loading files, sampling frames, and
watching full clips; report only checks performed for the current change. Avoid
describing visually tuned settings as factory calibration or measured accuracy.
