"use client";

import { useEffect, useRef } from "react";
import {
  createMobiusMesh,
  resolutionForWidth,
  type MobiusFace,
  type MobiusMesh,
  type MobiusVertex,
} from "./mobius-strip";

const TWO_PI = Math.PI * 2;
const YAW_PERIOD_MS = 14_000;
const FOCAL_LENGTH = 7.5;
const FALLBACK_ASPECT_RATIO = 0.62;
const MOBIUS_MAX_RADIUS = 1.72 + 0.72;
const VIEWPORT_SAFETY_FACTOR = 1.16;

export function mobiusScaleForViewport(width: number, height: number): number {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 0;
  }

  return (
    Math.min(width, height) / VIEWPORT_SAFETY_FACTOR / (2 * MOBIUS_MAX_RADIUS)
  );
}

type ProjectedVertex = {
  x: number;
  y: number;
  z: number;
};

type ProjectedTriangle = {
  points: [ProjectedVertex, ProjectedVertex, ProjectedVertex];
  depth: number;
  fillStyle: string;
};

type MeshLayout = {
  mesh: MobiusMesh;
  uSteps: number;
  vSteps: number;
  highlightGradient: {
    gradient: CanvasGradient;
    width: number;
    height: number;
  } | null;
};

function projectVertex(
  vertex: MobiusVertex,
  yaw: number,
  pitch: number,
  scale: number,
  centerX: number,
  centerY: number,
  verticalFloat: number,
): ProjectedVertex {
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x = vertex.x * cosYaw - vertex.z * sinYaw;
  let y = vertex.y;
  let z = vertex.x * sinYaw + vertex.z * cosYaw;

  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const pitchedY = y * cosPitch - z * sinPitch;
  z = y * sinPitch + z * cosPitch;
  y = pitchedY;

  const perspective = FOCAL_LENGTH / (FOCAL_LENGTH - z);

  return {
    x: centerX + x * scale * perspective,
    y: centerY + y * scale * perspective + verticalFloat,
    z,
  };
}

function projectFace(
  face: MobiusFace,
  mesh: MobiusMesh,
  projectedVertices: ProjectedVertex[],
): ProjectedTriangle {
  const points: [ProjectedVertex, ProjectedVertex, ProjectedVertex] = [
    projectedVertices[face[0]],
    projectedVertices[face[1]],
    projectedVertices[face[2]],
  ];
  const vertices = [
    mesh.vertices[face[0]],
    mesh.vertices[face[1]],
    mesh.vertices[face[2]],
  ];
  const averageU = (vertices[0].u + vertices[1].u + vertices[2].u) / 3;
  const averageV = (vertices[0].v + vertices[1].v + vertices[2].v) / 3;
  const normalizedU = (((averageU % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
  const hue = 222 + normalizedU * 68 + averageV * 6;
  const saturation = 78 + averageV * 4;
  const lightness = 48 + averageV * 10;

  return {
    points,
    depth: (points[0].z + points[1].z + points[2].z) / 3,
    fillStyle: `hsla(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%, 0.94)`,
  };
}

function drawMobius(
  context: CanvasRenderingContext2D,
  layout: MeshLayout,
  width: number,
  height: number,
  elapsedMs: number,
): void {
  context.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const { mesh, uSteps, vSteps } = layout;
  const yaw = ((elapsedMs % YAW_PERIOD_MS) / YAW_PERIOD_MS) * TWO_PI;
  const pitch = 0.2 + Math.sin(elapsedMs / 2_600) * 0.075;
  const verticalFloat = Math.sin(elapsedMs / 2_100) * height * 0.025;
  const scale = mobiusScaleForViewport(width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const projectedVertices = mesh.vertices.map((vertex) =>
    projectVertex(vertex, yaw, pitch, scale, centerX, centerY, verticalFloat),
  );

  let highlightGradient = layout.highlightGradient;
  if (
    !highlightGradient ||
    highlightGradient.width !== width ||
    highlightGradient.height !== height
  ) {
    const gradient = context.createLinearGradient(
      0,
      0,
      width * 0.8,
      height * 0.7,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.32)");
    gradient.addColorStop(0.55, "rgba(255, 255, 255, 0.08)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    highlightGradient = { gradient, width, height };
    layout.highlightGradient = highlightGradient;
  }

  const triangles = mesh.faces
    .map((face) => projectFace(face, mesh, projectedVertices))
    .sort((first, second) => first.depth - second.depth);

  for (const triangle of triangles) {
    const [first, second, third] = triangle.points;
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(second.x, second.y);
    context.lineTo(third.x, third.y);
    context.closePath();

    context.globalAlpha = 1;
    context.fillStyle = triangle.fillStyle;
    context.fill();

    context.globalAlpha = 0.16;
    context.fillStyle = highlightGradient.gradient;
    context.fill();
  }

  const rowSize = vSteps + 1;
  const drawMeshLine = (
    vIndex: number,
    alpha: number,
    lineWidth: number,
  ): void => {
    const firstPoint = projectedVertices[vIndex];
    if (!firstPoint) return;

    context.beginPath();
    context.moveTo(firstPoint.x, firstPoint.y);
    for (let uIndex = 1; uIndex <= uSteps; uIndex += 1) {
      const point = projectedVertices[uIndex * rowSize + vIndex];
      if (point) context.lineTo(point.x, point.y);
    }

    context.globalAlpha = alpha;
    context.strokeStyle = "#eef2ff";
    context.lineWidth = lineWidth;
    context.stroke();
  };

  drawMeshLine(0, 0.84, 1.2);
  drawMeshLine(vSteps, 0.84, 1.2);
  drawMeshLine(Math.floor(vSteps / 2), 0.34, 0.8);
  context.globalAlpha = 1;
}

export function MobiusStripVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context || typeof ResizeObserver === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let animationFrameId: number | null = null;
    let animationStart: number | null = null;
    let disposed = false;
    let width = 0;
    let height = 0;
    let layout: MeshLayout = {
      mesh: createMobiusMesh(resolutionForWidth(0)),
      uSteps: 64,
      vSteps: 12,
      highlightGradient: null,
    };

    const resizeCanvas = (nextWidth: number, nextHeight: number): void => {
      width = Number.isFinite(nextWidth) ? Math.max(0, nextWidth) : 0;
      const measuredHeight = Number.isFinite(nextHeight) ? nextHeight : 0;
      height =
        measuredHeight > 0 ? measuredHeight : width * FALLBACK_ASPECT_RATIO;

      const resolution = resolutionForWidth(width);
      if (
        layout.uSteps !== resolution.uSteps ||
        layout.vSteps !== resolution.vSteps
      ) {
        layout = {
          mesh: createMobiusMesh(resolution),
          uSteps: resolution.uSteps,
          vSteps: resolution.vSteps,
          highlightGradient: null,
        };
      } else if (
        layout.highlightGradient &&
        (layout.highlightGradient.width !== width ||
          layout.highlightGradient.height !== height)
      ) {
        layout.highlightGradient = null;
      }

      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      if (reducedMotion) {
        drawMobius(context, layout, width, height, 0);
      }
    };

    const drawFrame = (time: number): void => {
      animationFrameId = null;
      if (disposed) return;

      if (animationStart === null) animationStart = time;
      drawMobius(context, layout, width, height, time - animationStart);

      if (!reducedMotion) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const scheduleAnimation = (): void => {
      if (!reducedMotion && animationFrameId === null && !disposed) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent): void => {
      reducedMotion = event.matches;

      if (reducedMotion) {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        drawMobius(context, layout, width, height, 0);
        return;
      }

      animationStart = null;
      scheduleAnimation();
    };

    const resizeObserver = new ResizeObserver((entries) => {
      if (disposed) return;
      const entry = entries[0];
      if (!entry) return;

      resizeCanvas(entry.contentRect.width, entry.contentRect.height);
      scheduleAnimation();
    });

    mediaQuery.addEventListener("change", handleMotionPreferenceChange);
    const initialRect = container.getBoundingClientRect();
    resizeCanvas(initialRect.width, initialRect.height);
    resizeObserver.observe(container);
    scheduleAnimation();

    return () => {
      disposed = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
    };
  }, []);

  return (
    <div ref={containerRef} className="ca-mobius">
      <canvas
        ref={canvasRef}
        className="ca-mobius__canvas"
        aria-label="带有一次 180° 半扭转的莫比乌斯带"
      />
      <span className="ca-visually-hidden">
        这是一个带有一次 180° 半扭转的莫比乌斯带，可通过动态旋转观察其连续曲面。
      </span>
    </div>
  );
}
