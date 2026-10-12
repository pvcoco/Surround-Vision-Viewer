import { describe, expect, it } from "vitest";
import { edgeLines, EXTERIOR, groundQuad, solveHomography, type Point } from "../src/surround-geometry";

const corners: Point[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const calibration = { crop: 0.5, push: 0.12, depth: 0.26, nearWidth: 0.32, farWidth: 0.66, feather: 0.18, undistort: 0.38 };
function project(matrix: number[], [x, y]: Point): Point {
  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  return [(matrix[0] * x + matrix[1] * y + matrix[2]) / w, (matrix[3] * x + matrix[4] * y + matrix[5]) / w];
}

describe("surround projection", () => {
  for (const camera of EXTERIOR) {
    it(`maps ${camera} source corners onto the ground and back without reversing the image`, () => {
      const destination = groundQuad(camera, calibration);
      const forward = solveHomography(corners, destination)!;
      const inverse = solveHomography(destination, corners)!;
      for (let i = 0; i < 4; i++) {
        const mapped = project(forward, corners[i]);
        expect(mapped[0]).toBeCloseTo(destination[i][0], 8);
        expect(mapped[1]).toBeCloseTo(destination[i][1], 8);
        const recovered = project(inverse, destination[i]);
        expect(recovered[0]).toBeCloseTo(corners[i][0], 8);
        expect(recovered[1]).toBeCloseTo(corners[i][1], 8);
      }
      const center: Point = [0.37, 0.62];
      const restored = project(inverse, project(forward, center));
      expect(restored[0]).toBeCloseTo(center[0], 8);
      expect(restored[1]).toBeCloseTo(center[1], 8);
    });
  }
  it("rejects a collapsed plane rather than producing invalid shader coordinates", () => {
    expect(solveHomography(corners, [[1, 1], [1, 1], [1, 1], [1, 1]])).toBeNull();
  });
  it("puts front, rear, left and right on their corresponding sides of the vehicle", () => {
    const center = (camera: typeof EXTERIOR[number]) => groundQuad(camera, calibration).reduce(([x, y], point) => [x + point[0] / 4, y + point[1] / 4], [0, 0]);
    expect(center("FRONT")[1]).toBeLessThan(0.5);
    expect(center("REAR")[1]).toBeGreaterThan(0.5);
    expect(center("LEFT")[0]).toBeLessThan(0.5);
    expect(center("RIGHT")[0]).toBeGreaterThan(0.5);
  });
  it("measures inward distance to each patch edge for seam blending", () => {
    for (const camera of EXTERIOR) {
      const quad = groundQuad(camera, calibration), lines = edgeLines(quad);
      const distance = ([x, y]: Point) => lines.map(([nx, ny, c]) => nx * x + ny * y + c);
      for (const [i, line] of lines.entries()) {
        expect(Math.hypot(line[0], line[1])).toBeCloseTo(1, 10);
        expect(distance(quad[i])[i]).toBeCloseTo(0, 10);
        expect(distance(quad[(i + 1) % 4])[i]).toBeCloseTo(0, 10);
      }
      const center = quad.reduce<Point>(([x, y], point) => [x + point[0] / 4, y + point[1] / 4], [0, 0]);
      expect(Math.min(...distance(center))).toBeGreaterThan(0);
      // The near edge (index 2) faces the vehicle; points past it are outside the patch.
      expect(distance([0.5, 0.5])[2]).toBeLessThan(0);
    }
  });
});
