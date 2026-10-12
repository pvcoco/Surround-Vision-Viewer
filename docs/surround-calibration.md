# Surround calibration profiles

Choose a vehicle from **Surround 360 → gear → Vehicle profile**.

- **2025 Chevrolet Tahoe Z71** preserves the original GMSurroundVision calibration, including its camera crops, projection dimensions, blending, lens correction, and global settings. This is the test vehicle identified in that project's README.
- **2026 Cadillac VISTIQ** uses a separate calibration visually tuned against four-camera recordings from a 2026 VISTIQ. It is the default for new installations.

Changes are saved separately for each vehicle on the current device. Switching vehicles retains the viewing angle, zoom, and style. **Reset calibration** restores the selected vehicle's built-in settings; it does not replace the other vehicle's calibration. Existing unnamed calibrations migrate to the Tahoe profile. The four custom preset slots remain available for additional saved geometry.

## VISTIQ adjustments

The VISTIQ footage showed vehicle body panels at the bottom of the side-camera frames and excessive distant scenery in the ground projection. Its profile trims those pixels, increases the horizon crop, adjusts the side-camera patch widths and positions, increases lens correction slightly, and reduces edge blending. The global settings and vehicle graphic are shared with the original profile.

| Camera | Horizon crop | Body trim | Position offset | Near width | Far width | Blending | Lens correction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Front | 0.56 | 0.02 | 0 | 0.32 | 0.66 | 0.15 | 0.44 |
| Rear | 0.56 | 0.04 | 0 | 0.32 | 0.66 | 0.15 | 0.44 |
| Left | 0.52 | 0.10 | 0.02 | 0.40 | 0.64 | 0.15 | 0.46 |
| Right | 0.52 | 0.10 | -0.02 | 0.40 | 0.64 | 0.15 | 0.46 |

Crop and body trim are fractions of image height. Position offset moves the projected patch along its near edge; the opposite signs move both side-camera patches toward the vehicle's front. Widths and distances are fractions of the square ground canvas, rather than measurements in meters.

## Seam blending

The WebGL renderer composites all four cameras in one pass rather than layering the patches. Where patches overlap, each camera is weighted by how far the ground point lies inside that camera's far and side edges. The seam therefore runs along the middle of the overlap, usually diagonally from a vehicle corner, with a short normalized crossfade. Only the outside of the combined coverage fades to the ground color, so internal seams no longer show the background or depend on drawing order. A camera with no footage shows its striped placeholder only where no other camera covers the ground.

**Edge blending** sets the outer fade width and the seam crossfade width for each camera; the Tactical and Cinematic styles narrow or widen both. Both profiles keep their saved Edge blending values, but the Tahoe profile now uses this compositor instead of GMSurroundVision's layered alpha fade. The CSS fallback, used without WebGL, still layers masked patches without lens correction.

Exposure is not matched between cameras. In the sampled VISTIQ frames, overlapping regions often showed different ground content because of flat-ground misalignment, so color statistics from those overlaps were not a reliable basis for automatic gain correction.

## Validation and limits

The calibration was checked with 32 local MP4 files, covering all four exterior cameras across eight segments, grouped into six recordings. All camera videos decoded at 1280 × 768. Driveway pavers, pavement boundaries, curbs, and shadows provided visual references in parked and moving scenes. Playback, scrubbing, snapshots, profile switching, and segment boundaries were also checked in the browser.

This is a visual approximation using a single radial lens correction term and a flat-ground projection. It is not a factory lens calibration or a metric reconstruction. Elevated objects such as nearby vehicles and buildings can stretch or appear twice at camera seams, and sloped ground can still misalign. Use the individual camera view when inspecting fine detail.
