export type Point3 = {
  x: number;
  y: number;
  z: number;
};

export type MobiusPoint = Point3 & {
  u: number;
  v: number;
};

export type MobiusFace = [number, number, number];

export type MobiusMesh = {
  vertices: MobiusPoint[];
  faces: MobiusFace[];
  uSteps: number;
  vSteps: number;
  radius: number;
  halfWidth: number;
};

export type MobiusMeshOptions = {
  uSteps?: number;
  vSteps?: number;
  radius?: number;
  halfWidth?: number;
};

export type MobiusResolution = {
  uSteps: number;
  vSteps: number;
};

const MOBILE_BREAKPOINT = 640;
const PROJECTION_UNIT_RATIO = 0.17;

export function mobiusPoint(u: number, v: number, radius = 1.72): MobiusPoint {
  const radial = radius + v * Math.cos(u / 2);

  return {
    x: radial * Math.cos(u),
    y: radial * Math.sin(u),
    z: v * Math.sin(u / 2),
    u,
    v,
  };
}

export function createMobiusMesh({
  uSteps = 96,
  vSteps = 16,
  radius = 1.72,
  halfWidth = 0.58,
}: MobiusMeshOptions = {}): MobiusMesh {
  const vertices: MobiusPoint[] = [];
  const faces: MobiusFace[] = [];

  for (let i = 0; i <= uSteps; i += 1) {
    const u = (Math.PI * 2 * i) / uSteps;

    for (let j = 0; j <= vSteps; j += 1) {
      const v = -halfWidth + (2 * halfWidth * j) / vSteps;
      vertices.push(mobiusPoint(u, v, radius));
    }
  }

  const rowSize = vSteps + 1;

  for (let i = 0; i < uSteps; i += 1) {
    for (let j = 0; j < vSteps; j += 1) {
      const topLeft = i * rowSize + j;
      const topRight = topLeft + 1;
      const bottomLeft = (i + 1) * rowSize + j;
      const bottomRight = bottomLeft + 1;

      faces.push([topLeft, bottomLeft, topRight]);
      faces.push([topRight, bottomLeft, bottomRight]);
    }
  }

  return { vertices, faces, uSteps, vSteps, radius, halfWidth };
}

export function resolutionForWidth(width: number): MobiusResolution {
  return width < MOBILE_BREAKPOINT
    ? { uSteps: 64, vSteps: 12 }
    : { uSteps: 96, vSteps: 16 };
}

export function modelUnitForViewport(
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.min(viewportWidth, viewportHeight) * PROJECTION_UNIT_RATIO;
}
