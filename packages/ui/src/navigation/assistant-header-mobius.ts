export type MobiusPoint = {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
};

export type MobiusFace = [number, number, number];

export type MobiusMesh = {
  vertices: MobiusPoint[];
  faces: MobiusFace[];
};

const MOBIUS_RADIUS = 1.72;
const MOBIUS_HALF_WIDTH = 0.72;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

function normalizeSteps(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(`${name} must be finite and at least 1`);
  }

  return Math.floor(value);
}

export function mobiusPoint(
  u: number,
  v: number,
  radius = MOBIUS_RADIUS,
): MobiusPoint {
  assertFinite(u, "u");
  assertFinite(v, "v");
  assertFinite(radius, "radius");

  return {
    x: (radius + v * Math.cos(u / 2)) * Math.cos(u),
    y: (radius + v * Math.cos(u / 2)) * Math.sin(u),
    z: v * Math.sin(u / 2),
    u,
    v,
  };
}

export function createMobiusMesh(uSteps = 32, vSteps = 6): MobiusMesh {
  const normalizedUSteps = normalizeSteps(uSteps, "uSteps");
  const normalizedVSteps = normalizeSteps(vSteps, "vSteps");
  const rowSize = normalizedVSteps + 1;
  const vertices: MobiusPoint[] = [];
  const faces: MobiusFace[] = [];

  for (let uIndex = 0; uIndex <= normalizedUSteps; uIndex += 1) {
    const u = (2 * Math.PI * uIndex) / normalizedUSteps;

    for (let vIndex = 0; vIndex <= normalizedVSteps; vIndex += 1) {
      const v =
        -MOBIUS_HALF_WIDTH +
        (2 * MOBIUS_HALF_WIDTH * vIndex) / normalizedVSteps;
      vertices.push(mobiusPoint(u, v));
    }
  }

  for (let uIndex = 0; uIndex < normalizedUSteps; uIndex += 1) {
    for (let vIndex = 0; vIndex < normalizedVSteps; vIndex += 1) {
      const topLeft = uIndex * rowSize + vIndex;
      const topRight = (uIndex + 1) * rowSize + vIndex;
      const bottomLeft = topLeft + 1;
      const bottomRight = topRight + 1;

      faces.push(
        [topLeft, topRight, bottomRight],
        [topLeft, bottomRight, bottomLeft],
      );
    }
  }

  return { vertices, faces };
}

export function mobiusScaleForViewport(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;

  return (
    Math.min(width, height) / (1.16 * 2 * (MOBIUS_RADIUS + MOBIUS_HALF_WIDTH))
  );
}
