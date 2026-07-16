import { describe, expect, it } from "vitest";

import {
  createMobiusMesh,
  mobiusPoint,
  modelUnitForViewport,
  resolutionForWidth,
} from "./mobius-strip";

describe("mobius strip geometry", () => {
  it("maps the end of the strip to the opposite side at the seam", () => {
    const end = mobiusPoint(Math.PI * 2, 0.4);
    const oppositeStart = mobiusPoint(0, -0.4);

    expect(end.x).toBeCloseTo(oppositeStart.x);
    expect(end.y).toBeCloseTo(oppositeStart.y);
    expect(end.z).toBeCloseTo(oppositeStart.z);
  });

  it("creates a closed mesh with two triangles per grid cell", () => {
    const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });

    expect(mesh.vertices).toHaveLength((24 + 1) * (8 + 1));
    expect(mesh.faces).toHaveLength(24 * 8 * 2);
  });

  it("does not emit non-finite coordinates", () => {
    const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });

    expect(
      mesh.vertices.flatMap(({ x, y, z }) => [x, y, z]).every(Number.isFinite),
    ).toBe(true);
  });

  it("keeps every triangle index inside the generated vertex buffer", () => {
    const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });

    expect(
      mesh.faces
        .flat()
        .every((index) => index >= 0 && index < mesh.vertices.length),
    ).toBe(true);
  });

  it("keeps both boundary rows continuous across the sampled seam", () => {
    const mesh = createMobiusMesh({ uSteps: 24, vSteps: 8 });
    const rowSize = 8 + 1;

    for (let j = 0; j <= 8; j += 1) {
      const start = mesh.vertices[j];
      const end = mesh.vertices[rowSize * 24 + (8 - j)];

      expect(end.x).toBeCloseTo(start.x);
      expect(end.y).toBeCloseTo(start.y);
      expect(end.z).toBeCloseTo(start.z);
    }
  });

  it("selects a lower mesh resolution below the mobile breakpoint", () => {
    expect(resolutionForWidth(639)).toEqual({ uSteps: 64, vSteps: 12 });
    expect(resolutionForWidth(640)).toEqual({ uSteps: 96, vSteps: 16 });
  });

  it("uses a smaller projection unit so the rotating model has edge clearance", () => {
    expect(modelUnitForViewport(600, 500)).toBeCloseTo(85);
    expect(modelUnitForViewport(390, 360)).toBeCloseTo(61.2);
  });
});
