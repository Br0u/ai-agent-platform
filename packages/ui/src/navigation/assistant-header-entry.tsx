import { useId } from "react";
import "../app-shell.css";

type Point2 = readonly [number, number];

type MobiusFace = {
  points: readonly Point2[];
  opacity: number;
};

type MobiusMarkMesh = {
  faces: readonly MobiusFace[];
  edges: readonly (readonly Point2[])[];
  centerline: readonly Point2[];
};

const MOBIUS_SEGMENTS = 20;
const MOBIUS_HALF_WIDTH = 0.72;

function projectMobiusPoint(u: number, v: number) {
  const x = (1 + v * Math.cos(u / 2)) * Math.cos(u);
  const y = (1 + v * Math.cos(u / 2)) * Math.sin(u);
  const z = v * Math.sin(u / 2);

  const yaw = -0.62;
  const pitch = 0.42;
  const roll = -0.1;
  const yawX = x * Math.cos(yaw) + z * Math.sin(yaw);
  const yawZ = -x * Math.sin(yaw) + z * Math.cos(yaw);
  const pitchY = y * Math.cos(pitch) - yawZ * Math.sin(pitch);
  const pitchZ = y * Math.sin(pitch) + yawZ * Math.cos(pitch);
  const screenX = yawX * Math.cos(roll) - pitchY * Math.sin(roll);
  const screenY = yawX * Math.sin(roll) + pitchY * Math.cos(roll);

  return {
    point: [24 + screenX * 9.5, 24 - screenY * 9.5] as Point2,
    depth: pitchZ,
  };
}

function createMobiusMarkMesh(): MobiusMarkMesh {
  const faces: MobiusFace[] = [];
  const edges: Point2[][] = [[], []];
  const centerline: Point2[] = [];

  for (let index = 0; index < MOBIUS_SEGMENTS; index += 1) {
    const startU = (index / MOBIUS_SEGMENTS) * Math.PI * 2;
    const endU = ((index + 1) / MOBIUS_SEGMENTS) * Math.PI * 2;
    const start = projectMobiusPoint(startU, -MOBIUS_HALF_WIDTH);
    const startOpposite = projectMobiusPoint(startU, MOBIUS_HALF_WIDTH);
    const end = projectMobiusPoint(endU, -MOBIUS_HALF_WIDTH);
    const endOpposite = projectMobiusPoint(endU, MOBIUS_HALF_WIDTH);
    const depth =
      (start.depth + startOpposite.depth + end.depth + endOpposite.depth) / 4;

    faces.push({
      points: [start.point, end.point, endOpposite.point, startOpposite.point],
      opacity: 0.62 + Math.max(0, Math.min(1, (depth + 1.6) / 3.2)) * 0.32,
    });
    edges[0].push(start.point);
    edges[1].push(startOpposite.point);
    centerline.push(projectMobiusPoint(startU, 0).point);

    if (index === MOBIUS_SEGMENTS - 1) {
      edges[0].push(end.point);
      edges[1].push(endOpposite.point);
      centerline.push(projectMobiusPoint(endU, 0).point);
    }
  }

  return {
    faces: faces.sort((left, right) => left.opacity - right.opacity),
    edges,
    centerline,
  };
}

const MOBIUS_MARK_MESH = createMobiusMarkMesh();

function pointsAttribute(points: readonly Point2[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function pathAttribute(points: readonly Point2[]) {
  return points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ");
}

export type AssistantHeaderEntryProps = {
  isOpen?: boolean;
  onActivate: () => void;
};

export function AssistantHeaderEntry({
  isOpen = false,
  onActivate,
}: AssistantHeaderEntryProps) {
  const gradientId = `${useId()}-assistant-mobius-gradient`;

  return (
    <button
      aria-label="打开 AI 助理"
      aria-pressed={isOpen}
      className="assistant-header-entry"
      data-active={isOpen ? "true" : undefined}
      onClick={onActivate}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="assistant-header-entry__mark"
        focusable="false"
        viewBox="0 0 48 48"
      >
        <defs>
          <linearGradient id={gradientId} x1="4" x2="44" y1="8" y2="40">
            <stop offset="0" stopColor="var(--color-signal)" />
            <stop offset="0.5" stopColor="var(--color-structural)" />
            <stop offset="1" stopColor="var(--color-accent)" />
          </linearGradient>
        </defs>
        {MOBIUS_MARK_MESH.faces.map((face, index) => (
          <polygon
            key={`facet-${index}`}
            className="assistant-header-entry__facet"
            fill={`url(#${gradientId})`}
            opacity={face.opacity}
            points={pointsAttribute(face.points)}
          />
        ))}
        <path
          className="assistant-header-entry__edge"
          d={pathAttribute(MOBIUS_MARK_MESH.edges[0] ?? [])}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.7"
          strokeWidth="1.15"
        />
        <path
          className="assistant-header-entry__edge"
          d={pathAttribute(MOBIUS_MARK_MESH.edges[1] ?? [])}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.42"
          strokeWidth="0.85"
        />
        <path
          className="assistant-header-entry__seam"
          d={pathAttribute(MOBIUS_MARK_MESH.centerline)}
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.72"
          strokeWidth="0.8"
        />
      </svg>
      <span className="assistant-header-entry__label">AI 助理</span>
    </button>
  );
}
