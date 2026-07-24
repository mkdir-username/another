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

/**
 * Normalized finger displacement across the canvas.
 * The OS has already applied the natural-scrolling preference to the delta sign, so with
 * natural scrolling on we flip it back: the on-screen finger must travel the same physical
 * direction the fingers travel on the trackpad.
 */
export function wheelToFingerDelta(e: WheelLike, rect: Size, naturalScroll: boolean): Delta {
  const unit = e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? rect.height : 1;
  const sign = naturalScroll ? -1 : 1;
  return {
    dx: (sign * e.deltaX * unit) / rect.width,
    dy: (sign * e.deltaY * unit) / rect.height,
  };
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
