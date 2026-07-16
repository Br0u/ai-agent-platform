"use client";

import { useEffect, useRef } from "react";

import {
  createMobiusMesh,
  modelUnitForViewport,
  resolutionForWidth,
  type MobiusMesh,
  type MobiusPoint,
} from "./mobius-strip";

type ProjectedPoint = {
  x: number;
  y: number;
  z: number;
  depth: number;
  screenX: number;
  screenY: number;
};

type ProjectedMobiusPoint = ProjectedPoint & Pick<MobiusPoint, "u" | "v">;

type RenderFace = {
  points: [ProjectedMobiusPoint, ProjectedMobiusPoint, ProjectedMobiusPoint];
  depth: number;
  layerIndex: number;
  u: number;
  light: number;
};

type Layer = {
  scale: number;
  yawOffset: number;
  hueOffset: number;
  opacity: number;
  edgeColor: string;
};

const TWO_PI = Math.PI * 2;
const CAMERA_DISTANCE = 5.4;
export const ROTATION_DURATION_MS = 24_000;
const LAYERS: Layer[] = [
  {
    scale: 1,
    yawOffset: 0,
    hueOffset: 0,
    opacity: 0.88,
    edgeColor: "rgba(188, 249, 255, 0.9)",
  },
  {
    scale: 0.88,
    yawOffset: 0.04,
    hueOffset: 28,
    opacity: 0.68,
    edgeColor: "rgba(193, 189, 255, 0.76)",
  },
  {
    scale: 0.77,
    yawOffset: -0.06,
    hueOffset: 58,
    opacity: 0.55,
    edgeColor: "rgba(135, 231, 255, 0.64)",
  },
];

function rotatePoint(
  point: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  scale: number,
): { x: number; y: number; z: number } {
  const scaledX = point.x * scale;
  const scaledY = point.y * scale;
  const scaledZ = point.z * scale;

  const yawX = scaledX * Math.cos(yaw) - scaledZ * Math.sin(yaw);
  const yawZ = scaledX * Math.sin(yaw) + scaledZ * Math.cos(yaw);
  const pitchY = scaledY * Math.cos(pitch) - yawZ * Math.sin(pitch);
  const pitchZ = scaledY * Math.sin(pitch) + yawZ * Math.cos(pitch);

  return {
    x: yawX,
    y: pitchY,
    z: pitchZ,
  };
}

function projectPoint(
  point: { x: number; y: number; z: number },
  viewportWidth: number,
  viewportHeight: number,
  yaw: number,
  pitch: number,
  scale: number,
): ProjectedPoint {
  const rotated = rotatePoint(point, yaw, pitch, scale);
  const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - rotated.z);
  const unit = modelUnitForViewport(viewportWidth, viewportHeight);

  return {
    ...rotated,
    depth: rotated.z,
    screenX: viewportWidth / 2 + rotated.x * unit * perspective,
    screenY: viewportHeight * 0.45 - rotated.y * unit * perspective,
  };
}

function projectMobiusPoint(
  point: MobiusPoint,
  viewportWidth: number,
  viewportHeight: number,
  yaw: number,
  pitch: number,
  scale: number,
): ProjectedMobiusPoint {
  return {
    ...projectPoint(point, viewportWidth, viewportHeight, yaw, pitch, scale),
    u: point.u,
    v: point.v,
  };
}

function triangleLight(
  first: MobiusPoint,
  second: MobiusPoint,
  third: MobiusPoint,
): number {
  const edgeA = {
    x: second.x - first.x,
    y: second.y - first.y,
    z: second.z - first.z,
  };
  const edgeB = {
    x: third.x - first.x,
    y: third.y - first.y,
    z: third.z - first.z,
  };
  const normalZ = edgeA.x * edgeB.y - edgeA.y * edgeB.x;
  const normalY = edgeA.z * edgeB.x - edgeA.x * edgeB.z;
  const normalX = edgeA.y * edgeB.z - edgeA.z * edgeB.y;
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
  const facingLight = Math.abs(normalZ / normalLength) * 0.72;
  const rimLight = Math.abs(normalY / normalLength) * 0.2;

  return Math.min(1, 0.38 + facingLight + rimLight);
}

function drawFloorGlow(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = context.createRadialGradient(
    width / 2,
    height * 0.78,
    0,
    width / 2,
    height * 0.78,
    Math.min(width, height) * 0.38,
  );
  gradient.addColorStop(0, "rgba(48, 139, 255, 0.26)");
  gradient.addColorStop(0.44, "rgba(100, 74, 255, 0.13)");
  gradient.addColorStop(1, "rgba(100, 74, 255, 0)");

  context.save();
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(
    width / 2,
    height * 0.77,
    Math.min(width, height) * 0.36,
    Math.min(width, height) * 0.1,
    0,
    0,
    TWO_PI,
  );
  context.fill();
  context.restore();
}

function projectMesh(
  mesh: MobiusMesh,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
): { projectedLayers: ProjectedMobiusPoint[][]; faces: RenderFace[] } {
  const projectedLayers = LAYERS.map((layer) =>
    mesh.vertices.map((point) =>
      projectMobiusPoint(
        point,
        width,
        height,
        yaw + layer.yawOffset,
        pitch,
        layer.scale,
      ),
    ),
  );
  const faces: RenderFace[] = [];

  mesh.faces.forEach(([firstIndex, secondIndex, thirdIndex]) => {
    LAYERS.forEach((layer, layerIndex) => {
      const points = projectedLayers[layerIndex];
      const first = points[firstIndex];
      const second = points[secondIndex];
      const third = points[thirdIndex];

      if (!first || !second || !third) {
        return;
      }

      faces.push({
        points: [first, second, third],
        depth: (first.depth + second.depth + third.depth) / 3,
        layerIndex,
        u: (first.u + second.u + third.u) / 3,
        light: triangleLight(first, second, third),
      });
    });
  });

  return { projectedLayers, faces };
}

function drawFace(context: CanvasRenderingContext2D, face: RenderFace): void {
  const [first, second, third] = face.points;
  const layer = LAYERS[face.layerIndex];
  const hue = 190 + ((face.u / TWO_PI) % 1) * 112 + layer.hueOffset;
  const lightness = 49 + face.light * 18;

  context.save();
  context.globalAlpha = layer.opacity;
  context.fillStyle = `hsl(${hue}, 94%, ${lightness}%)`;
  context.beginPath();
  context.moveTo(first.screenX, first.screenY);
  context.lineTo(second.screenX, second.screenY);
  context.lineTo(third.screenX, third.screenY);
  context.closePath();
  context.fill();
  context.restore();
}

function drawScene(
  context: CanvasRenderingContext2D,
  mesh: MobiusMesh,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
): void {
  const { projectedLayers, faces } = projectMesh(
    mesh,
    width,
    height,
    yaw,
    pitch,
  );
  faces.sort((first, second) => first.depth - second.depth);

  for (const face of faces) {
    drawFace(context, face);
  }

  drawMeshLines(context, mesh, projectedLayers[0], LAYERS[0]);
}

function drawMeshLines(
  context: CanvasRenderingContext2D,
  mesh: MobiusMesh,
  points: ProjectedMobiusPoint[],
  layer: Layer,
): void {
  const rowSize = mesh.vSteps + 1;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = layer.edgeColor;
  context.shadowColor = "rgba(48, 149, 255, 0.74)";
  context.shadowBlur = 10;
  context.lineWidth = 2.2;

  for (const column of [0, mesh.vSteps]) {
    context.beginPath();
    for (let i = 0; i <= mesh.uSteps; i += 1) {
      const point = points[i * rowSize + column];
      if (!point) continue;
      if (i === 0) context.moveTo(point.screenX, point.screenY);
      else context.lineTo(point.screenX, point.screenY);
    }
    context.stroke();
  }

  context.shadowBlur = 4;
  context.globalAlpha = 0.52;
  context.lineWidth = 1.2;
  context.strokeStyle = "rgba(233, 238, 255, 0.86)";
  context.beginPath();
  for (let i = 0; i <= mesh.uSteps; i += 1) {
    const point = points[i * rowSize + Math.floor(mesh.vSteps / 2)];
    if (!point) continue;
    if (i === 0) context.moveTo(point.screenX, point.screenY);
    else context.lineTo(point.screenX, point.screenY);
  }
  context.stroke();
  context.restore();
}

export function MobiusStripVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!container || !canvas || !context) {
      return undefined;
    }

    let mesh = createMobiusMesh(resolutionForWidth(640));
    let animationFrame: number | null = null;
    let disposed = false;
    let startTime = 0;
    let viewportWidth = 640;
    let viewportHeight = 420;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const cancelAnimation = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const drawFrame = (elapsed: number) => {
      if (disposed) return;

      const progress = motionQuery.matches
        ? 0
        : (elapsed % ROTATION_DURATION_MS) / ROTATION_DURATION_MS;
      const yaw = 0.34 + progress * TWO_PI;
      const pitch = -0.32 + Math.sin(progress * TWO_PI) * 0.04;

      context.clearRect(0, 0, viewportWidth, viewportHeight);
      drawFloorGlow(context, viewportWidth, viewportHeight);
      drawScene(context, mesh, viewportWidth, viewportHeight, yaw, pitch);
    };

    const scheduleAnimation = () => {
      if (disposed || motionQuery.matches || animationFrame !== null) {
        return;
      }

      animationFrame = window.requestAnimationFrame((timestamp) => {
        animationFrame = null;
        drawFrame(timestamp - startTime);
        scheduleAnimation();
      });
    };

    const resize = (entries?: readonly ResizeObserverEntry[]) => {
      const rect = container.getBoundingClientRect();
      const observedRect = entries?.[0]?.contentRect;
      viewportWidth = Math.max(
        observedRect?.width ?? 0,
        rect.width,
        container.clientWidth,
        320,
      );
      viewportHeight = Math.max(
        observedRect?.height ?? 0,
        rect.height,
        container.clientHeight,
        360,
      );

      const resolution = resolutionForWidth(viewportWidth);
      if (
        mesh.uSteps !== resolution.uSteps ||
        mesh.vSteps !== resolution.vSteps
      ) {
        mesh = createMobiusMesh(resolution);
      }

      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewportWidth * devicePixelRatio);
      canvas.height = Math.round(viewportHeight * devicePixelRatio);
      canvas.style.width = `${viewportWidth}px`;
      canvas.style.height = `${viewportHeight}px`;
      canvas.dataset.meshResolution = `${mesh.uSteps}x${mesh.vSteps}`;
      canvas.dataset.rotationDuration = `${ROTATION_DURATION_MS}`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      drawFrame(performance.now() - startTime);
    };

    const onMotionChange = () => {
      cancelAnimation();
      drawFrame(performance.now() - startTime);
      scheduleAnimation();
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver((entries) => resize(entries));

    startTime = performance.now();
    resize();
    resizeObserver?.observe(container);

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", onMotionChange);
    } else {
      motionQuery.addListener(onMotionChange);
    }

    scheduleAnimation();

    return () => {
      disposed = true;
      cancelAnimation();
      resizeObserver?.disconnect();

      if (typeof motionQuery.removeEventListener === "function") {
        motionQuery.removeEventListener("change", onMotionChange);
      } else {
        motionQuery.removeListener(onMotionChange);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="ca-mobius"
      aria-label="三维莫比乌斯带视觉"
    >
      <canvas
        ref={canvasRef}
        className="ca-mobius__canvas"
        role="img"
        aria-label="带有一次 180° 半扭转的莫比乌斯带"
      />
      <span className="ca-sr-only">
        正在缓慢旋转的三维莫比乌斯带，由多层蓝色、青色和紫色发光带面组成。
      </span>
    </div>
  );
}
