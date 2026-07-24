import { describe, it, expect } from "vitest";
import { wheelToFingerDelta, advanceDrag, clamp01, pinchPointers, PINCH_BASE_SPAN, edgeSideAt, isEdgeBack, EDGE_ZONE } from "./gestures";

const rect = { width: 400, height: 800 };
const base = { natural: false, invert: false, gain: 1 };

describe("wheelToFingerDelta", () => {
  it("classic scrolling: палец идёт против знака дельты", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, base);
    expect(d.dy).toBeCloseTo(-0.1);
  });

  it("natural scrolling переворачивает знак обратно", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, { ...base, natural: true });
    expect(d.dy).toBeCloseTo(0.1);
  });

  it("тумблер инверсии перекрывает системную настройку", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, { ...base, invert: true });
    expect(d.dy).toBeCloseTo(0.1);
  });

  it("инверсия и natural вместе гасят друг друга", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, { natural: true, invert: true, gain: 1 });
    expect(d.dy).toBeCloseTo(-0.1);
  });

  it("gain усиливает смещение", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 80, deltaMode: 0 }, rect, { ...base, gain: 3 });
    expect(d.dy).toBeCloseTo(-0.3);
  });

  it("горизонталь нормализуется по ширине, а не по высоте", () => {
    const d = wheelToFingerDelta({ deltaX: 40, deltaY: 0, deltaMode: 0 }, rect, base);
    expect(d.dx).toBeCloseTo(0.1);
  });

  it("оси идут в противоположных знаках — так требует macOS", () => {
    const d = wheelToFingerDelta({ deltaX: 40, deltaY: 80, deltaMode: 0 }, rect, base);
    expect(Math.sign(d.dx)).toBe(1);
    expect(Math.sign(d.dy)).toBe(-1);
  });

  it("инверсия переворачивает обе оси разом", () => {
    const d = wheelToFingerDelta({ deltaX: 40, deltaY: 80, deltaMode: 0 }, rect, { ...base, invert: true });
    expect(d.dx).toBeCloseTo(-0.1);
    expect(d.dy).toBeCloseTo(0.1);
  });

  it("построчный режим переводится в пиксели", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 5, deltaMode: 1 }, rect, base);
    expect(d.dy).toBeCloseTo(-0.1);
  });

  it("постраничный режим меряется высотой окна", () => {
    const d = wheelToFingerDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, rect, base);
    expect(d.dy).toBeCloseTo(-1);
  });
});

describe("edgeSideAt", () => {
  it("узнаёт левую и правую кромку", () => {
    expect(edgeSideAt(0.02)).toBe("left");
    expect(edgeSideAt(0.98)).toBe("right");
  });

  it("середина экрана краем не считается", () => {
    expect(edgeSideAt(0.5)).toBeNull();
    expect(edgeSideAt(EDGE_ZONE + 0.01)).toBeNull();
  });
});

describe("isEdgeBack", () => {
  it("свайп вправо от левой кромки — это назад", () => {
    expect(isEdgeBack("left", 0.2, 0.01)).toBe(true);
  });

  it("свайп влево от правой кромки — это назад", () => {
    expect(isEdgeBack("right", -0.2, 0.01)).toBe(true);
  });

  it("свайп в сторону кромки не считается", () => {
    expect(isEdgeBack("left", -0.2, 0.01)).toBe(false);
  });

  it("вертикальный свайп у кромки остаётся скроллом", () => {
    expect(isEdgeBack("left", 0.2, 0.5)).toBe(false);
  });

  it("слишком короткое движение не срабатывает", () => {
    expect(isEdgeBack("left", 0.02, 0)).toBe(false);
  });

  it("вне кромки не срабатывает никогда", () => {
    expect(isEdgeBack(null, 0.9, 0)).toBe(false);
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
