import { describe, expect, it } from "vitest";
import {
  createMobiusMesh,
  mobiusPoint,
  resolutionForWidth,
} from "./mobius-strip";

const expectPointClose = (
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
) => {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.z).toBeCloseTo(expected.z, 10);
};

describe("mobiusPoint", () => {
  it("matches the Möbius strip formula at representative values", () => {
    expectPointClose(mobiusPoint(0, 0.4, 1.72), {
      x: 2.12,
      y: 0,
      z: 0,
    });
    expectPointClose(mobiusPoint(Math.PI, 0.4, 1.72), {
      x: -1.72,
      y: 0,
      z: 0.4,
    });
  });

  it("maps the 2π seam to the u=0 point with reversed v", () => {
    const radius = 1.72;
    const v = 0.41;
    const point = mobiusPoint(2 * Math.PI, v, radius);

    expect(point.u).toBe(2 * Math.PI);
    expect(point.v).toBe(v);

    expectPointClose(point, mobiusPoint(0, -v, radius));
  });

  it.each([
    ["u", Number.NaN, 0, 1.72],
    ["u", Number.POSITIVE_INFINITY, 0, 1.72],
    ["u", Number.NEGATIVE_INFINITY, 0, 1.72],
    ["v", 0, Number.NaN, 1.72],
    ["v", 0, Number.POSITIVE_INFINITY, 1.72],
    ["v", 0, Number.NEGATIVE_INFINITY, 1.72],
    ["radius", 0, 0, Number.NaN],
    ["radius", 0, 0, Number.POSITIVE_INFINITY],
    ["radius", 0, 0, Number.NEGATIVE_INFINITY],
  ])("rejects a non-finite %s", (_name, u, v, radius) => {
    expect(() => mobiusPoint(u, v, radius)).toThrow(RangeError);
  });
});

describe("createMobiusMesh", () => {
  it("creates the expected number of vertices and triangle faces", () => {
    const uSteps = 8;
    const vSteps = 4;
    const mesh = createMobiusMesh({ uSteps, vSteps });
    const rowSize = vSteps + 1;

    expect(mesh.vertices).toHaveLength((uSteps + 1) * (vSteps + 1));
    expect(mesh.faces).toHaveLength(uSteps * vSteps * 2);
    expect(mesh.faces[0]).toEqual([0, rowSize, rowSize + 1]);
    expect(mesh.faces[1]).toEqual([0, rowSize + 1, 1]);
  });

  it("floors valid step counts and rejects values below one", () => {
    expect(() => createMobiusMesh({ uSteps: 0.9, vSteps: 1 })).toThrow(
      RangeError,
    );
    expect(() => createMobiusMesh({ uSteps: 1, vSteps: 0.9 })).toThrow(
      RangeError,
    );

    const mesh = createMobiusMesh({ uSteps: 1.9, vSteps: 2.9 });
    expect(mesh.vertices).toHaveLength(6);
    expect(mesh.faces).toHaveLength(4);
  });

  it.each([
    ["uSteps", { uSteps: Number.NaN, vSteps: 1 }],
    ["uSteps", { uSteps: Number.POSITIVE_INFINITY, vSteps: 1 }],
    ["vSteps", { uSteps: 1, vSteps: Number.NaN }],
    ["vSteps", { uSteps: 1, vSteps: Number.POSITIVE_INFINITY }],
    ["radius", { uSteps: 1, vSteps: 1, radius: Number.NaN }],
    ["radius", { uSteps: 1, vSteps: 1, radius: Number.POSITIVE_INFINITY }],
    ["halfWidth", { uSteps: 1, vSteps: 1, halfWidth: Number.NaN }],
    [
      "halfWidth",
      { uSteps: 1, vSteps: 1, halfWidth: Number.POSITIVE_INFINITY },
    ],
  ])("rejects non-finite %s", (_name, options) => {
    expect(() => createMobiusMesh(options)).toThrow(RangeError);
  });

  it("keeps every face index legal and every vertex coordinate finite", () => {
    const mesh = createMobiusMesh({ uSteps: 11, vSteps: 5 });

    for (const vertex of mesh.vertices) {
      expect(Number.isFinite(vertex.x)).toBe(true);
      expect(Number.isFinite(vertex.y)).toBe(true);
      expect(Number.isFinite(vertex.z)).toBe(true);
    }

    for (const face of mesh.faces) {
      expect(face).toHaveLength(3);
      for (const index of face) {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(mesh.vertices.length);
      }
    }
  });

  it("keeps both seam columns continuous with reversed rows", () => {
    const uSteps = 7;
    const vSteps = 6;
    const radius = 2.3;
    const halfWidth = 0.8;
    const mesh = createMobiusMesh({
      uSteps,
      vSteps,
      radius,
      halfWidth,
    });
    const rowSize = vSteps + 1;

    for (let vIndex = 0; vIndex <= vSteps; vIndex += 1) {
      const v = -halfWidth + (2 * halfWidth * vIndex) / vSteps;
      const firstColumn = mesh.vertices[vIndex];
      const lastColumn = mesh.vertices[uSteps * rowSize + (vSteps - vIndex)];

      expectPointClose(firstColumn, mobiusPoint(0, v, radius));
      expectPointClose(lastColumn, mobiusPoint(2 * Math.PI, -v, radius));
      expectPointClose(lastColumn, firstColumn);
    }
  });
});

describe("resolutionForWidth", () => {
  it("switches resolution at exactly 640px", () => {
    expect(resolutionForWidth(639)).toEqual({ uSteps: 64, vSteps: 12 });
    expect(resolutionForWidth(640)).toEqual({ uSteps: 96, vSteps: 16 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects a non-finite width: %s",
    (width) => {
      expect(() => resolutionForWidth(width)).toThrow(RangeError);
    },
  );
});
