export type Vec2 = [number, number];

export type ShapeTransform = {
  translate?: Vec2;
  scale?: Vec2;
  rotate?: number;
  origin?: Vec2;
};

export type LineShape = {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  stroke?: string;
  thickness?: number;
  opacity?: number;
  transform?: ShapeTransform;
};

export type RectShape = {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  transform?: ShapeTransform;
};

export type CircleShape = {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  transform?: ShapeTransform;
};

export type SceneShape = LineShape | RectShape | CircleShape;

export type SceneDefinition = {
  width: number;
  height: number;
  background: string;
  shapes: SceneShape[];
};

const scaleTransform = (transform: ShapeTransform | undefined, sx: number, sy: number): ShapeTransform | undefined => {
  if (!transform) {
    return undefined;
  }

  return {
    ...transform,
    translate: transform.translate ? [transform.translate[0] * sx, transform.translate[1] * sy] : undefined,
    origin: transform.origin ? [transform.origin[0] * sx, transform.origin[1] * sy] : undefined,
    scale: transform.scale,
    rotate: transform.rotate,
  };
};

export function scaleSceneDefinition(scene: SceneDefinition, targetWidth: number, targetHeight: number): SceneDefinition {
  const sx = targetWidth / scene.width;
  const sy = targetHeight / scene.height;

  const shapes = scene.shapes.map((shape): SceneShape => {
    if (shape.type === "line") {
      return {
        ...shape,
        x1: shape.x1 * sx,
        y1: shape.y1 * sy,
        x2: shape.x2 * sx,
        y2: shape.y2 * sy,
        thickness: shape.thickness !== undefined ? shape.thickness * ((sx + sy) * 0.5) : shape.thickness,
        transform: scaleTransform(shape.transform, sx, sy),
      };
    }

    if (shape.type === "rect") {
      return {
        ...shape,
        x: shape.x * sx,
        y: shape.y * sy,
        width: shape.width * sx,
        height: shape.height * sy,
        strokeWidth: shape.strokeWidth !== undefined ? shape.strokeWidth * ((sx + sy) * 0.5) : shape.strokeWidth,
        transform: scaleTransform(shape.transform, sx, sy),
      };
    }

    return {
      ...shape,
      cx: shape.cx * sx,
      cy: shape.cy * sy,
      r: shape.r * ((sx + sy) * 0.5),
      strokeWidth: shape.strokeWidth !== undefined ? shape.strokeWidth * ((sx + sy) * 0.5) : shape.strokeWidth,
      transform: scaleTransform(shape.transform, sx, sy),
    };
  });

  return {
    ...scene,
    width: targetWidth,
    height: targetHeight,
    shapes,
  };
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isColor = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isVec2 = (value: unknown): value is Vec2 =>
  Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);

const isTransform = (value: unknown): value is ShapeTransform => {
  if (value === undefined) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const translateOk = candidate.translate === undefined || isVec2(candidate.translate);
  const scaleOk = candidate.scale === undefined || isVec2(candidate.scale);
  const rotateOk = candidate.rotate === undefined || isFiniteNumber(candidate.rotate);
  const originOk = candidate.origin === undefined || isVec2(candidate.origin);

  return translateOk && scaleOk && rotateOk && originOk;
};

function isLineShape(value: unknown): value is LineShape {
  if (!value || typeof value !== "object") {
    return false;
  }

  const shape = value as Record<string, unknown>;

  return (
    shape.type === "line" &&
    isFiniteNumber(shape.x1) &&
    isFiniteNumber(shape.y1) &&
    isFiniteNumber(shape.x2) &&
    isFiniteNumber(shape.y2) &&
    ((shape.color === undefined && isColor(shape.stroke)) ||
      (shape.stroke === undefined && isColor(shape.color)) ||
      (isColor(shape.color) && isColor(shape.stroke))) &&
    (shape.thickness === undefined || isFiniteNumber(shape.thickness)) &&
    (shape.opacity === undefined || isFiniteNumber(shape.opacity)) &&
    isTransform(shape.transform)
  );
}

function isRectShape(value: unknown): value is RectShape {
  if (!value || typeof value !== "object") {
    return false;
  }

  const shape = value as Record<string, unknown>;

  return (
    shape.type === "rect" &&
    isFiniteNumber(shape.x) &&
    isFiniteNumber(shape.y) &&
    isFiniteNumber(shape.width) &&
    isFiniteNumber(shape.height) &&
    ((shape.fill === undefined && isColor(shape.stroke)) ||
      (shape.stroke === undefined && isColor(shape.fill)) ||
      (isColor(shape.fill) && isColor(shape.stroke))) &&
    (shape.strokeWidth === undefined || isFiniteNumber(shape.strokeWidth)) &&
    (shape.opacity === undefined || isFiniteNumber(shape.opacity)) &&
    isTransform(shape.transform)
  );
}

function isCircleShape(value: unknown): value is CircleShape {
  if (!value || typeof value !== "object") {
    return false;
  }

  const shape = value as Record<string, unknown>;

  return (
    shape.type === "circle" &&
    isFiniteNumber(shape.cx) &&
    isFiniteNumber(shape.cy) &&
    isFiniteNumber(shape.r) &&
    ((shape.fill === undefined && isColor(shape.stroke)) ||
      (shape.stroke === undefined && isColor(shape.fill)) ||
      (isColor(shape.fill) && isColor(shape.stroke))) &&
    (shape.strokeWidth === undefined || isFiniteNumber(shape.strokeWidth)) &&
    (shape.opacity === undefined || isFiniteNumber(shape.opacity)) &&
    isTransform(shape.transform)
  );
}

export function parseSceneDefinition(source: string): SceneDefinition {
  const parsed = JSON.parse(source) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Scena musi byc obiektem JSON.");
  }

  const scene = parsed as Record<string, unknown>;
  const width = scene.width;
  const height = scene.height;
  const background = scene.background ?? "#ffffff";
  const shapes = scene.shapes;

  if (!isFiniteNumber(width) || width <= 0) {
    throw new Error("Pole 'width' musi byc dodatnia liczba.");
  }

  if (!isFiniteNumber(height) || height <= 0) {
    throw new Error("Pole 'height' musi byc dodatnia liczba.");
  }

  if (!isColor(background)) {
    throw new Error("Pole 'background' musi byc tekstowym kolorem.");
  }

  if (!Array.isArray(shapes)) {
    throw new Error("Pole 'shapes' musi byc tablica.");
  }

  const typedShapes: SceneShape[] = [];

  for (let index = 0; index < shapes.length; index += 1) {
    const shape = shapes[index];

    if (isLineShape(shape) || isRectShape(shape) || isCircleShape(shape)) {
      typedShapes.push(shape);
      continue;
    }

    throw new Error(`Niepoprawny obiekt shape na pozycji ${index}.`);
  }

  return {
    width,
    height,
    background,
    shapes: typedShapes,
  };
}

export const defaultSceneSource = `{
  "width": 900,
  "height": 560,
  "background": "#f8fafc",
  "shapes": [
    {
      "type": "rect",
      "x": 120,
      "y": 90,
      "width": 260,
      "height": 140,
      "fill": "#2563eb",
      "stroke": "#1e3a8a",
      "strokeWidth": 6
    },
    {
      "type": "circle",
      "cx": 520,
      "cy": 190,
      "r": 78,
      "fill": "#22c55e",
      "stroke": "#14532d",
      "strokeWidth": 10,
      "transform": {
        "translate": [0, 0],
        "scale": [1.2, 0.8],
        "rotate": 25,
        "origin": [520, 190]
      }
    },
    {
      "type": "line",
      "x1": 80,
      "y1": 440,
      "x2": 820,
      "y2": 300,
      "stroke": "#0f172a",
      "thickness": 4,
      "transform": {
        "translate": [0, -20],
        "rotate": -5,
        "origin": [450, 370]
      }
    }
  ]
}`;