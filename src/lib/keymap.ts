export const ANDROID = {
  A: 29, C: 31, V: 50, X: 52, Z: 54,
  DEL: 67, ENTER: 66, FORWARD_DEL: 112, TAB: 61, ESCAPE: 111, SPACE: 62,
  UP: 19, DOWN: 20, LEFT: 21, RIGHT: 22,
  MOVE_HOME: 122,
  HOME: 3, BACK: 4,
  META_SHIFT: 0x1,
  META_CTRL: 0x1000,
} as const;

export interface KeyStroke {
  keycode: number;
  meta: number;
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const PLAIN: Record<string, number> = {
  Enter: ANDROID.ENTER,
  Backspace: ANDROID.DEL,
  Delete: ANDROID.FORWARD_DEL,
  ArrowUp: ANDROID.UP,
  ArrowDown: ANDROID.DOWN,
  ArrowLeft: ANDROID.LEFT,
  ArrowRight: ANDROID.RIGHT,
  Tab: ANDROID.TAB,
};

const CMD_TO_CTRL: Record<string, number> = {
  c: ANDROID.C, v: ANDROID.V, x: ANDROID.X, a: ANDROID.A, z: ANDROID.Z,
};

/** Returns the strokes to inject, or null when the event should be typed as text instead. */
export function resolveKey(e: KeyLike): KeyStroke[] | null {
  // BACK rather than ESCAPE: Android's escape key is honoured by almost nothing,
  // while BACK closes whatever is on screen even where no back affordance is drawn.
  if (e.key === "Escape" && !e.metaKey && !e.altKey) {
    return [{ keycode: e.shiftKey ? ANDROID.HOME : ANDROID.BACK, meta: 0 }];
  }

  if (e.key === "Backspace") {
    if (e.metaKey) {
      return [
        { keycode: ANDROID.MOVE_HOME, meta: ANDROID.META_SHIFT },
        { keycode: ANDROID.DEL, meta: 0 },
      ];
    }
    if (e.altKey) return [{ keycode: ANDROID.DEL, meta: ANDROID.META_CTRL }];
  }

  if (e.metaKey) {
    const keycode = CMD_TO_CTRL[e.key.toLowerCase()];
    return keycode ? [{ keycode, meta: ANDROID.META_CTRL }] : null;
  }

  if (e.altKey) return null;

  const plain = PLAIN[e.key];
  return plain ? [{ keycode: plain, meta: 0 }] : null;
}

/**
 * Fires when Cmd+Shift are pressed and released without anything in between.
 * fn would be the natural key for this, but WebKit never reports it in keydown.
 */
export function createModComboWatcher() {
  let armed = false;
  let polluted = false;

  return {
    down(e: { key: string; metaKey: boolean; shiftKey: boolean }) {
      if (e.key === "Meta" || e.key === "Shift") {
        if (e.metaKey && e.shiftKey) armed = true;
        return;
      }
      if (armed) polluted = true;
    },
    up(e: { key: string; metaKey: boolean; shiftKey: boolean }): boolean {
      if (e.key !== "Meta" && e.key !== "Shift") return false;
      const fire = armed && !polluted;
      armed = false;
      polluted = false;
      return fire;
    },
  };
}

/** scrcpy injects text through KeyCharacterMap, which only covers the virtual US layout. */
export function needsClipboard(text: string): boolean {
  return [...text].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
}
