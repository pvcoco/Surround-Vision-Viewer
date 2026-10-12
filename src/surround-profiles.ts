// Original Tahoe calibration adapted from GMSurroundVision by ABSG Inc. (MIT).
// See THIRD_PARTY_NOTICES.md. VISTIQ settings were visually tuned using local clips.
import { EXTERIOR, type CameraCalibration, type ExteriorCamera } from "./surround-geometry";

export type SurroundStyle = "factory" | "tactical" | "cinematic";
export interface Calibration {
  cams: Record<ExteriorCamera, CameraCalibration>;
  carSize: number; ground: number; perspective: number; guides: boolean;
  pitch: number; yaw: number; zoom: number; style: SurroundStyle;
}
export const TAHOE_PROFILE_ID = "2025-chevrolet-tahoe-z71";
export const VISTIQ_PROFILE_ID = "2026-cadillac-vistiq";
export const DEFAULT_PROFILE_ID = VISTIQ_PROFILE_ID;

export const CAMERA_PARAMETERS: [keyof CameraCalibration, string, number, number][] = [
  ["crop", "Horizon crop", 0, 0.75], ["bottomCrop", "Vehicle body trim", 0, 0.2],
  ["offset", "Camera position along edge", -0.25, 0.25], ["push", "Distance from vehicle", 0, 0.45],
  ["depth", "Ground depth", 0.1, 0.9], ["nearWidth", "Near width", 0.05, 1.2],
  ["farWidth", "Far width", 0.1, 2.5], ["feather", "Edge blending", 0, 0.5], ["undistort", "Lens correction", 0, 0.9],
];
export const GLOBAL_PARAMETERS: ["perspective" | "carSize" | "ground", string, number, number][] = [
  ["perspective", "Perspective", 0.6, 3], ["carSize", "Vehicle size", 0.1, 0.6], ["ground", "Ground darkness", 0, 1],
];

interface VehicleProfile {
  id: string;
  name: string;
  description: string;
  calibration: Calibration;
}

const originalFrontRear = { crop: 0.5, bottomCrop: 0, offset: 0, push: 0.12, depth: 0.26, nearWidth: 0.32, farWidth: 0.66, feather: 0.18, undistort: 0.38 };
const originalLeftRight = { crop: 0.45, bottomCrop: 0, offset: 0, push: 0.05, depth: 0.22, nearWidth: 0.34, farWidth: 0.58, feather: 0.18, undistort: 0.38 };
const globals = { carSize: 0.34, pitch: 0, yaw: 0, zoom: 1, ground: 0.55, guides: true, perspective: 1.25, style: "factory" as const };
const profiles: VehicleProfile[] = [
  {
    id: TAHOE_PROFILE_ID,
    name: "2025 Chevrolet Tahoe Z71",
    description: "Original calibration from the GMSurroundVision test vehicle.",
    calibration: { ...globals, cams: { FRONT: { ...originalFrontRear }, REAR: { ...originalFrontRear }, LEFT: { ...originalLeftRight }, RIGHT: { ...originalLeftRight } } },
  },
  {
    id: VISTIQ_PROFILE_ID,
    name: "2026 Cadillac VISTIQ",
    description: "Visually tuned using 1280 × 768 recordings from a 2026 VISTIQ.",
    calibration: { ...globals, cams: {
      FRONT: { ...originalFrontRear, crop: 0.56, bottomCrop: 0.02, feather: 0.15, undistort: 0.44 },
      REAR: { ...originalFrontRear, crop: 0.56, bottomCrop: 0.04, feather: 0.15, undistort: 0.44 },
      LEFT: { ...originalLeftRight, crop: 0.52, bottomCrop: 0.1, offset: 0.02, nearWidth: 0.4, farWidth: 0.64, feather: 0.15, undistort: 0.46 },
      RIGHT: { ...originalLeftRight, crop: 0.52, bottomCrop: 0.1, offset: -0.02, nearWidth: 0.4, farWidth: 0.64, feather: 0.15, undistort: 0.46 },
    } },
  },
];

/** Expose metadata, and return independent copies of the immutable built-in settings. */
export const VEHICLE_PROFILES = profiles.map(({ id, name, description }) => ({ id, name, description }));
export function profileCalibration(id: string = DEFAULT_PROFILE_ID): Calibration {
  const profile = profiles.find((profile) => profile.id === id) ?? profiles.find((profile) => profile.id === DEFAULT_PROFILE_ID)!;
  return structuredClone(profile.calibration);
}

export function normalizeCalibration(raw: unknown, defaults = profileCalibration()): Calibration {
  const result = structuredClone(defaults);
  if (!raw || typeof raw !== "object") return result;
  const data = raw as Partial<Calibration>;
  const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  for (const cam of EXTERIOR) {
    for (const [key, , min, max] of CAMERA_PARAMETERS) result.cams[cam][key] = number(data.cams?.[cam]?.[key], result.cams[cam][key] ?? 0, min, max);
    result.cams[cam].bottomCrop = Math.min(result.cams[cam].bottomCrop ?? 0, 0.95 - result.cams[cam].crop);
  }
  for (const [key, , min, max] of GLOBAL_PARAMETERS) result[key] = number(data[key], result[key], min, max);
  result.pitch = number(data.pitch, result.pitch, 0, 70); result.yaw = number(data.yaw, result.yaw, 0, 360); result.zoom = number(data.zoom, result.zoom, 0.6, 2.2);
  if (typeof data.guides === "boolean") result.guides = data.guides;
  if (["factory", "tactical", "cinematic"].includes(data.style ?? "")) result.style = data.style!;
  return result;
}
