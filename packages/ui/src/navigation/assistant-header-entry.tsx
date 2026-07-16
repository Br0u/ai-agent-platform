"use client";

import { useEffect, useRef } from "react";
import "../app-shell.css";
import {
  createMobiusMesh,
  mobiusScaleForViewport,
  type MobiusFace,
  type MobiusMesh,
  type MobiusPoint,
} from "./assistant-header-mobius";

const TWO_PI = Math.PI * 2;
const YAW_PERIOD_MS = 11_000;
const FOCAL_LENGTH = 7.5;
const HEADER_MESH = createMobiusMesh();

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

function projectVertex(
  vertex: MobiusPoint,
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
    fillStyle: `hsl(${hue.toFixed(1)} ${saturation.toFixed(1)}% ${lightness.toFixed(1)}%)`,
  };
}

function drawAssistantMobius(
  context: CanvasRenderingContext2D,
  mesh: MobiusMesh,
  width: number,
  height: number,
  elapsedMs: number,
): void {
  context.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const yaw = ((elapsedMs % YAW_PERIOD_MS) / YAW_PERIOD_MS) * TWO_PI;
  const pitch = 0.2 + Math.sin(elapsedMs / 2_600) * 0.075;
  const verticalFloat = Math.sin(elapsedMs / 2_100) * height * 0.035;
  const scale = mobiusScaleForViewport(width, height);
  const projectedVertices = mesh.vertices.map((vertex) =>
    projectVertex(
      vertex,
      yaw,
      pitch,
      scale,
      width / 2,
      height / 2,
      verticalFloat,
    ),
  );
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

    context.globalAlpha = 0.2;
    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.fill();
  }

  const rowSize = 7;
  const drawMeshLine = (
    vIndex: number,
    alpha: number,
    lineWidth: number,
  ): void => {
    const firstPoint = projectedVertices[vIndex];
    if (!firstPoint) return;

    context.beginPath();
    context.moveTo(firstPoint.x, firstPoint.y);
    for (let uIndex = 1; uIndex <= 32; uIndex += 1) {
      const point = projectedVertices[uIndex * rowSize + vIndex];
      if (point) context.lineTo(point.x, point.y);
    }

    context.globalAlpha = alpha;
    context.strokeStyle = "#eef2ff";
    context.lineWidth = lineWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
  };

  drawMeshLine(0, 0.84, 1.05);
  drawMeshLine(6, 0.84, 1.05);
  drawMeshLine(3, 0.42, 0.72);
  context.globalAlpha = 1;
}

export type AssistantHeaderEntryProps = {
  isOpen?: boolean;
  mode?: "launcher" | "workspace";
  onActivate: (trigger: HTMLButtonElement) => void;
};

export function AssistantHeaderEntry({
  isOpen = false,
  mode = "launcher",
  onActivate,
}: AssistantHeaderEntryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceMode = mode === "workspace";

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;
    let animationFrameId: number | null = null;
    let animationStart: number | null = null;
    let width = 25;
    let height = 25;
    let disposed = false;

    const resizeCanvas = (nextWidth: number, nextHeight: number): void => {
      width = Math.max(1, Number.isFinite(nextWidth) ? nextWidth : 25);
      height = Math.max(1, Number.isFinite(nextHeight) ? nextHeight : 25);
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      if (reducedMotion) {
        drawAssistantMobius(context, HEADER_MESH, width, height, 0);
      }
    };

    const drawFrame = (time: number): void => {
      animationFrameId = null;
      if (disposed) return;
      if (animationStart === null) animationStart = time;

      drawAssistantMobius(
        context,
        HEADER_MESH,
        width,
        height,
        time - animationStart,
      );

      if (!reducedMotion) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const scheduleAnimation = (): void => {
      if (!reducedMotion && animationFrameId === null && !disposed) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
      }
    };

    const handleMotionChange = (event: MediaQueryListEvent): void => {
      reducedMotion = event.matches;
      animationStart = null;

      if (reducedMotion && animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      drawFrame(0);
      scheduleAnimation();
    };

    resizeCanvas(canvas.clientWidth || 25, canvas.clientHeight || 25);
    drawFrame(0);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const entry = entries[0];
            resizeCanvas(
              entry?.contentRect.width ?? canvas.clientWidth,
              entry?.contentRect.height ?? canvas.clientHeight,
            );
          });
    resizeObserver?.observe(canvas);

    mediaQuery.addEventListener?.("change", handleMotionChange);

    return () => {
      disposed = true;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver?.disconnect();
      mediaQuery.removeEventListener?.("change", handleMotionChange);
    };
  }, []);

  return (
    <button
      aria-label={workspaceMode ? "聚焦 AI 助理提问框" : "打开 AI 助理"}
      aria-pressed={workspaceMode ? undefined : isOpen}
      className="assistant-header-entry"
      data-active={!workspaceMode && isOpen ? "true" : undefined}
      onClick={(event) => onActivate(event.currentTarget)}
      type="button"
    >
      <canvas
        aria-hidden="true"
        className="assistant-header-entry__mark"
        ref={canvasRef}
      />
      <span className="assistant-header-entry__label">
        {workspaceMode ? "继续提问" : "AI 助理"}
      </span>
    </button>
  );
}
