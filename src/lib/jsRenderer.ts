import type { SceneDefinition, SceneShape, ShapeTransform } from "./scene";

const DEG_TO_RAD = Math.PI / 180;

function withTransform(
  ctx: CanvasRenderingContext2D,
  transform: ShapeTransform | undefined,
  draw: () => void
) {
  ctx.save();

  if (transform?.translate) {
    ctx.translate(transform.translate[0], transform.translate[1]);
  }

  if (transform?.origin) {
    ctx.translate(transform.origin[0], transform.origin[1]);
  }

  if (transform?.rotate) {
    ctx.rotate(transform.rotate * DEG_TO_RAD);
  }

  if (transform?.scale) {
    ctx.scale(transform.scale[0], transform.scale[1]);
  }

  if (transform?.origin) {
    ctx.translate(-transform.origin[0], -transform.origin[1]);
  }

  draw();
  ctx.restore();
}

const clampOpacity = (value: number | undefined): number => {
  if (value === undefined || Number.isNaN(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
};

function renderShape(ctx: CanvasRenderingContext2D, shape: SceneShape) {
  if (shape.type === "line") {
    withTransform(ctx, shape.transform, () => {
      ctx.globalAlpha = clampOpacity(shape.opacity);
      ctx.strokeStyle = shape.stroke ?? shape.color ?? "#000000";
      ctx.lineWidth = shape.thickness ?? 1;
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    });
    return;
  }

  if (shape.type === "rect") {
    withTransform(ctx, shape.transform, () => {
      ctx.globalAlpha = clampOpacity(shape.opacity);
      if (shape.fill) {
        ctx.fillStyle = shape.fill;
        ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
      }
      if (shape.stroke && (shape.strokeWidth ?? 1) > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth ?? 1;
        ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
      }
    });
    return;
  }

  withTransform(ctx, shape.transform, () => {
    ctx.globalAlpha = clampOpacity(shape.opacity);
    ctx.beginPath();
    ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
    if (shape.fill) {
      ctx.fillStyle = shape.fill;
      ctx.fill();
    }
    if (shape.stroke && (shape.strokeWidth ?? 1) > 0) {
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.strokeWidth ?? 1;
      ctx.stroke();
    }
  });
}

export function renderSceneWithCanvas2D(scene: SceneDefinition): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Nie mozna utworzyc kontekstu 2D.");
  }

  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);

  for (const shape of scene.shapes) {
    renderShape(ctx, shape);
  }

  return ctx.getImageData(0, 0, scene.width, scene.height).data;
}