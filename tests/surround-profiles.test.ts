import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE_ID, TAHOE_PROFILE_ID, VISTIQ_PROFILE_ID, VEHICLE_PROFILES, normalizeCalibration, profileCalibration } from "../src/surround-profiles";
import { groundQuad } from "../src/surround-geometry";

describe("vehicle calibration profiles", () => {
  it("preserves the original GMSurroundVision Tahoe values", () => {
    const calibration = profileCalibration(TAHOE_PROFILE_ID);
    expect(VEHICLE_PROFILES.find((profile) => profile.id === TAHOE_PROFILE_ID)?.name).toBe("2025 Chevrolet Tahoe Z71");
    expect(calibration.cams.FRONT).toEqual({ crop: 0.5, bottomCrop: 0, offset: 0, push: 0.12, depth: 0.26, nearWidth: 0.32, farWidth: 0.66, feather: 0.18, undistort: 0.38 });
    expect(calibration.cams.REAR).toEqual(calibration.cams.FRONT);
    expect(calibration.cams.LEFT).toEqual({ crop: 0.45, bottomCrop: 0, offset: 0, push: 0.05, depth: 0.22, nearWidth: 0.34, farWidth: 0.58, feather: 0.18, undistort: 0.38 });
    expect(calibration.cams.RIGHT).toEqual(calibration.cams.LEFT);
    expect({ ...calibration, cams: undefined }).toEqual({ cams: undefined, carSize: 0.34, pitch: 0, yaw: 0, zoom: 1, ground: 0.55, guides: true, perspective: 1.25, style: "factory" });
  });
  it("returns independent settings so editing one vehicle cannot overwrite a built-in profile", () => {
    const tahoe = profileCalibration(TAHOE_PROFILE_ID), vistiq = profileCalibration(VISTIQ_PROFILE_ID);
    tahoe.cams.FRONT.crop = 0.7; vistiq.cams.LEFT.offset = 0.1;
    expect(profileCalibration(TAHOE_PROFILE_ID).cams.FRONT.crop).toBe(0.5);
    expect(profileCalibration(VISTIQ_PROFILE_ID).cams.LEFT.offset).toBe(0.02);
    expect(DEFAULT_PROFILE_ID).toBe(VISTIQ_PROFILE_ID);
  });
  it("moves both side-camera ground patches forward symmetrically", () => {
    const vistiq = profileCalibration(VISTIQ_PROFILE_ID);
    const left = groundQuad("LEFT", vistiq.cams.LEFT), right = groundQuad("RIGHT", vistiq.cams.RIGHT);
    expect(left.reduce((total, point) => total + point[1] / 4, 0)).toBeCloseTo(0.48);
    expect(right.reduce((total, point) => total + point[1] / 4, 0)).toBeCloseTo(0.48);
  });
  it("normalizes corrupt settings without losing the selected vehicle's defaults", () => {
    const defaults = profileCalibration(TAHOE_PROFILE_ID);
    const normalized = normalizeCalibration({ cams: { FRONT: { crop: 10, bottomCrop: 10, offset: NaN, undistort: -3 } } }, defaults);
    expect(normalized.cams.FRONT.crop).toBe(0.75);
    expect(normalized.cams.FRONT.bottomCrop).toBeCloseTo(0.2);
    expect(normalized.cams.FRONT.offset).toBe(0);
    expect(normalized.cams.FRONT.undistort).toBe(0);
    expect(normalized.cams.REAR).toEqual(defaults.cams.REAR);
    expect(normalizeCalibration(null, defaults)).toEqual(defaults);
  });
});
