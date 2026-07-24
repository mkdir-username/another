import { describe, it, expect } from "vitest";
import { resolveKey, needsClipboard, ANDROID, createModComboWatcher } from "./keymap";

const k = (key: string, mod: Partial<{ metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
  ({ key, metaKey: false, altKey: false, shiftKey: false, ...mod });

describe("resolveKey", () => {
  it("Cmd+C уходит на устройство как Ctrl+C", () => {
    expect(resolveKey(k("c", { metaKey: true }))).toEqual([{ keycode: ANDROID.C, meta: ANDROID.META_CTRL }]);
  });

  it("Cmd+V, Cmd+X, Cmd+A, Cmd+Z тоже переводятся в Ctrl", () => {
    expect(resolveKey(k("v", { metaKey: true }))).toEqual([{ keycode: ANDROID.V, meta: ANDROID.META_CTRL }]);
    expect(resolveKey(k("x", { metaKey: true }))).toEqual([{ keycode: ANDROID.X, meta: ANDROID.META_CTRL }]);
    expect(resolveKey(k("a", { metaKey: true }))).toEqual([{ keycode: ANDROID.A, meta: ANDROID.META_CTRL }]);
    expect(resolveKey(k("z", { metaKey: true }))).toEqual([{ keycode: ANDROID.Z, meta: ANDROID.META_CTRL }]);
  });

  it("Option+Backspace удаляет слово", () => {
    expect(resolveKey(k("Backspace", { altKey: true }))).toEqual([{ keycode: ANDROID.DEL, meta: ANDROID.META_CTRL }]);
  });

  it("Cmd+Backspace выделяет до начала строки и стирает", () => {
    expect(resolveKey(k("Backspace", { metaKey: true }))).toEqual([
      { keycode: ANDROID.MOVE_HOME, meta: ANDROID.META_SHIFT },
      { keycode: ANDROID.DEL, meta: 0 },
    ]);
  });

  it("Escape закрывает экран — шлёт системный BACK, а не ESCAPE", () => {
    expect(resolveKey(k("Escape"))).toEqual([{ keycode: ANDROID.BACK, meta: 0 }]);
  });

  it("Shift+Escape уводит на домашний экран, когда назад некуда", () => {
    expect(resolveKey(k("Escape", { shiftKey: true }))).toEqual([{ keycode: ANDROID.HOME, meta: 0 }]);
  });

  it("стрелки и ввод работают без модификаторов", () => {
    expect(resolveKey(k("ArrowUp"))).toEqual([{ keycode: ANDROID.UP, meta: 0 }]);
    expect(resolveKey(k("Enter"))).toEqual([{ keycode: ANDROID.ENTER, meta: 0 }]);
    expect(resolveKey(k("Backspace"))).toEqual([{ keycode: ANDROID.DEL, meta: 0 }]);
  });

  it("обычный символ клавишей не считается — он идёт текстом", () => {
    expect(resolveKey(k("ф"))).toBeNull();
    expect(resolveKey(k("a"))).toBeNull();
  });

  it("незнакомая комбинация игнорируется", () => {
    expect(resolveKey(k("q", { metaKey: true }))).toBeNull();
  });
});

describe("createModComboWatcher", () => {
  it("Cmd+Shift нажаты и отпущены вхолостую — срабатывает", () => {
    const w = createModComboWatcher();
    w.down({ key: "Meta", metaKey: true, shiftKey: false });
    w.down({ key: "Shift", metaKey: true, shiftKey: true });
    expect(w.up({ key: "Shift", metaKey: true, shiftKey: false })).toBe(true);
  });

  it("если между ними нажали букву — не срабатывает", () => {
    const w = createModComboWatcher();
    w.down({ key: "Meta", metaKey: true, shiftKey: false });
    w.down({ key: "Shift", metaKey: true, shiftKey: true });
    w.down({ key: "r", metaKey: true, shiftKey: true });
    expect(w.up({ key: "Shift", metaKey: true, shiftKey: false })).toBe(false);
  });

  it("одного Cmd недостаточно", () => {
    const w = createModComboWatcher();
    w.down({ key: "Meta", metaKey: true, shiftKey: false });
    expect(w.up({ key: "Meta", metaKey: false, shiftKey: false })).toBe(false);
  });
});

describe("needsClipboard", () => {
  it("ASCII идёт быстрым путём", () => {
    expect(needsClipboard("hello")).toBe(false);
  });

  it("кириллица требует буфера обмена", () => {
    expect(needsClipboard("привет")).toBe(true);
  });

  it("эмодзи тоже", () => {
    expect(needsClipboard("ok 🙂")).toBe(true);
  });
});
