export const GESTURE_END_MS = 90;
const LINE_HEIGHT_PX = 16;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Delta {
  dx: number;
  dy: number;
}

export interface WheelTuning {
  natural: boolean;
  invertX: boolean;
  invertY: boolean;
  gain: number;
}

/**
 * Normalized finger displacement across the canvas.
 * Each axis carries its OWN flip: deriving one shared sign from the system preference kept getting
 * one axis right and the other wrong, so direction is a per-axis setting rather than a deduction.
 */
export function wheelToFingerDelta(e: WheelLike, rect: Size, tuning: WheelTuning): Delta {
  const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? rect.height : 1;
  const signX = (tuning.natural !== tuning.invertX ? -1 : 1) * tuning.gain;
  const signY = (tuning.natural !== tuning.invertY ? -1 : 1) * tuning.gain;
  return {
    dx: (signX * e.deltaX * unit) / rect.width,
    dy: (signY * e.deltaY * unit) / rect.height,
  };
}

export const INERTIA_FRICTION = 0.94;
export const INERTIA_MIN_SPEED = 0.0012;
export const INERTIA_MAX_MS = 1400;
const VELOCITY_SMOOTHING = 0.25;

export interface Velocity {
  vx: number;
  vy: number;
}

/** Exponential moving average, so one jittery frame doesn't decide how far the throw carries. */
export function trackVelocity(prev: Velocity, delta: Delta, smoothing = VELOCITY_SMOOTHING): Velocity {
  return {
    vx: prev.vx + (delta.dx - prev.vx) * smoothing,
    vy: prev.vy + (delta.dy - prev.vy) * smoothing,
  };
}

export function decayVelocity(v: Velocity, friction = INERTIA_FRICTION): Velocity {
  return { vx: v.vx * friction, vy: v.vy * friction };
}

export function isVelocityAlive(v: Velocity, min = INERTIA_MIN_SPEED): boolean {
  return Math.abs(v.vx) >= min || Math.abs(v.vy) >= min;
}

export const EDGE_ZONE = 0.08;
export const EDGE_BACK_TRAVEL = 0.12;
export const EDGE_DRAG_ESCAPE = 0.06;

export type EdgeSide = "left" | "right" | null;

export function edgeSideAt(x: number, zone = EDGE_ZONE): EdgeSide {
  if (x <= zone) return "left";
  if (x >= 1 - zone) return "right";
  return null;
}

/** Inward horizontal travel from a screen edge — the intent behind Android's back gesture. */
export function isEdgeBack(side: EdgeSide, dx: number, dy: number, travel = EDGE_BACK_TRAVEL): boolean {
  if (!side) return false;
  if (Math.abs(dx) < travel) return false;
  if (Math.abs(dx) <= Math.abs(dy)) return false;
  return side === "left" ? dx > 0 : dx < 0;
}

export function advanceDrag(from: Point, delta: Delta): Point {
  return { x: clamp01(from.x + delta.dx), y: clamp01(from.y + delta.dy) };
}

export const PINCH_BASE_SPAN = 0.18;

/** Two vertically separated fingers around the pinch centre; scale comes from the WebKit gesture event. */
export function pinchPointers(center: Point, scale: number): { a: Point; b: Point } {
  const half = (PINCH_BASE_SPAN * Math.max(scale, 0.1)) / 2;
  return {
    a: { x: clamp01(center.x), y: clamp01(center.y - half) },
    b: { x: clamp01(center.x), y: clamp01(center.y + half) },
  };
}
