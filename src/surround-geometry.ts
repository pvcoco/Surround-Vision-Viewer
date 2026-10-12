// Ground-plane geometry adapted from GMSurroundVision by ABSG Inc. (MIT).
// See THIRD_PARTY_NOTICES.md for the original copyright and license.
import type { Camera } from "./recordings";

export type ExteriorCamera = Exclude<Camera, "CABIN">;
export type Point = [number, number];
export interface CameraCalibration {
  crop: number;
  bottomCrop?: number;
  offset?: number;
  push: number;
  depth: number;
  nearWidth: number;
  farWidth: number;
  feather: number;
  undistort: number;
}
export const BEARINGS: Record<ExteriorCamera, number> = { FRONT: 0, RIGHT: 90, REAR: 180, LEFT: 270 };
export const EXTERIOR: ExteriorCamera[] = ["FRONT", "REAR", "LEFT", "RIGHT"];

export function groundQuad(cam: ExteriorCamera, p: CameraCalibration, size = 1): Point[] {
  const angle = BEARINGS[cam] * Math.PI / 180;
  const fx = Math.sin(angle), fy = -Math.cos(angle), rx = Math.cos(angle), ry = Math.sin(angle);
  const centerX = size / 2 + rx * (p.offset ?? 0) * size, centerY = size / 2 + ry * (p.offset ?? 0) * size;
  const nearX = centerX + fx * p.push * size, nearY = centerY + fy * p.push * size;
  const farX = centerX + fx * (p.push + p.depth) * size, farY = centerY + fy * (p.push + p.depth) * size;
  const far = p.farWidth * size / 2, near = p.nearWidth * size / 2;
  return [[farX - rx * far, farY - ry * far], [farX + rx * far, farY + ry * far],
    [nearX + rx * near, nearY + ry * near], [nearX - rx * near, nearY - ry * near]];
}

/**
 * Line equations [nx, ny, c] for each quad edge, in quad order (far, side, near, side).
 * The normal is a unit vector pointing inward, so nx * x + ny * y + c is the distance inside that edge.
 */
export function edgeLines(quad: Point[]): [number, number, number][] {
  const center = quad.reduce((sum, [x, y]) => [sum[0] + x / 4, sum[1] + y / 4], [0, 0]);
  return quad.map(([ax, ay], i) => {
    const [bx, by] = quad[(i + 1) % 4], length = Math.hypot(bx - ax, by - ay) || 1;
    let nx = (ay - by) / length, ny = (bx - ax) / length;
    if (nx * (center[0] - ax) + ny * (center[1] - ay) < 0) { nx = -nx; ny = -ny; }
    return [nx, ny, -(nx * ax + ny * ay)];
  });
}

/** Solve a projective map for four pairs of corners using partial pivoting. */
export function solveHomography(source: Point[], destination: Point[]): number[] | null {
  const matrix: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = source[i], [u, v] = destination[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    if (Math.abs(matrix[pivot][col]) < 1e-12) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    const divisor = matrix[col][col];
    for (let k = col; k <= 8; k++) matrix[col][k] /= divisor;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let k = col; k <= 8; k++) matrix[row][k] -= factor * matrix[col][k];
    }
  }
  return [...matrix.map((row) => row[8]), 1];
}

export function cssHomography(h: number[]): string {
  return `matrix3d(${[h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]].join(",")})`;
}
