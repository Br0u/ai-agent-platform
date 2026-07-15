export type Point3 = {
  x: number;
  y: number;
  z: number;
};

export type MobiusPoint = Point3 & {
  u: number;
  v: number;
};

export type MobiusVertex = MobiusPoint;

export type MobiusFace = [number, number, number];

export type MobiusMesh = {
  vertices: MobiusVertex[];
  faces: MobiusFace[];
};

export type MobiusMeshOptions = {
  uSteps: number;
  vSteps: number;
  radius?: number;
  halfWidth?: number;
};

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

export function mobiusPoint(u: number, v: number, radius = 1.72): MobiusPoint {
  assertFinite(u, "u");
  assertFinite(v, "v");
  assertFinite(radius, "radius");

  const x = (radius + v * Math.cos(u / 2)) * Math.cos(u);
  const y = (radius + v * Math.cos(u / 2)) * Math.sin(u);
  const z = v * Math.sin(u / 2);

  return { x, y, z, u, v };
}

export function createMobiusMesh({
  uSteps,
  vSteps,
  radius = 1.72,
  halfWidth = 0.72,
}: MobiusMeshOptions): MobiusMesh {
  const normalizedUSteps = normalizeSteps(uSteps, "uSteps");
  const normalizedVSteps = normalizeSteps(vSteps, "vSteps");
  assertFinite(radius, "radius");
  assertFinite(halfWidth, "halfWidth");
  const rowSize = normalizedVSteps + 1;
  const vertices: MobiusVertex[] = [];
  const faces: MobiusFace[] = [];

  for (let uIndex = 0; uIndex <= normalizedUSteps; uIndex += 1) {
    const u = (2 * Math.PI * uIndex) / normalizedUSteps;

    for (let vIndex = 0; vIndex <= normalizedVSteps; vIndex += 1) {
      const v = -halfWidth + (2 * halfWidth * vIndex) / normalizedVSteps;
      vertices.push(mobiusPoint(u, v, radius));
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

export function resolutionForWidth(width: number): {
  uSteps: number;
  vSteps: number;
} {
  assertFinite(width, "width");

  return width < 640 ? { uSteps: 64, vSteps: 12 } : { uSteps: 96, vSteps: 16 };
}
