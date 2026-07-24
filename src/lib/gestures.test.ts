import { describe, it, expect } from "vitest";
import { wheelToFingerDelta, advanceDrag, clamp01, pinchPointers, PINCH_BASE_SPAN } from "./gestures";

const rect = { width: 400, height: 800 };

describe("wheelToFingerDelta", () => {
  it("classic scrolling: пальцы вниз двигают палец вниз по экрану", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, false);
    expect(d.dy).toBeCloseTo(0.1);
  });

  it("natural scrolling: тот же deltaY даёт противоположное направление", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, true);
    expect(d.dy).toBeCloseTo(-0.1);
  });

  it("горизонталь нормализуется по ширине, а не по высоте", () => {
    const d = wheelToFingerDelta({ deltaX: 40, deltaY: 0, deltaMode: 0 }, rect, false);
    expect(d.dx).toBeCloseTo(0.1);
  });

  it("построчный режим переводится в пиксели", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 5, deltaMode: 1 }, rect, false);
    expect(d.dy).toBeCloseTo(0.1);
  });

  it("постраничный режим меряется высотой окна", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, rect, false);
    expect(d.dy).toBeCloseTo(1);
  });
});

describe("advanceDrag", () => {
  it("накапливает смещение", () => {
    const next = advanceDrag({ x: 0.5, y: 0.5 }, { dx: 0.1, dy: -0.2 });
    expect(next.x).toBeCloseTo(0.6);
    expect(next.y).toBeCloseTo(0.3);
  });

  it("не выпускает палец за пределы экрана", () => {
    expect(advanceDrag({ x: 0.95, y: 0.02 }, { dx: 0.5, dy: -0.5 })).toEqual({ x: 1, y: 0 });
  });
});

describe("clamp01", () => {
  it("зажимает в 0..1", () => {
    expect([clamp01(-3), clamp01(0.4), clamp01(9)]).toEqual([0, 0.4, 1]);
  });
});

describe("pinchPointers", () => {
  it("при scale=1 пальцы разведены на базовый зазор вокруг центра", () => {
    const { a, b } = pinchPointers({ x: 0.5, y: 0.5 }, 1);
    expect(b.y - a.y).toBeCloseTo(PINCH_BASE_SPAN);
    expect(a.x).toBeCloseTo(0.5);
    expect(b.x).toBeCloseTo(0.5);
  });

  it("разведение пальцев увеличивает зазор", () => {
    const wide = pinchPointers({ x: 0.5, y: 0.5 }, 2);
    expect(wide.b.y - wide.a.y).toBeGreaterThan(PINCH_BASE_SPAN);
  });

  it("щипок сводит пальцы", () => {
    const narrow = pinchPointers({ x: 0.5, y: 0.5 }, 0.5);
    expect(narrow.b.y - narrow.a.y).toBeLessThan(PINCH_BASE_SPAN);
  });

  it("у края экрана пальцы не уезжают за границу", () => {
    const { a, b } = pinchPointers({ x: 0.5, y: 0.02 }, 3);
    expect(a.y).toBe(0);
    expect(b.y).toBeLessThanOrEqual(1);
  });
});
