import { useState, useCallback } from "react";

export interface GestureSettings {
  swipeGain: number;
  invertX: boolean;
  invertY: boolean;
  edgeBack: boolean;
  scrollInertia: boolean;
}

const KEY = "gesture_settings";
const DEFAULTS: GestureSettings = { swipeGain: 2.5, invertX: false, invertY: false, edgeBack: true, scrollInertia: true };

/** Kept out of `Settings` on purpose: updating that one schedules a reconnect and tears down the video stream. */
export function useGestureSettings() {
  const [settings, setSettings] = useState<GestureSettings>(() => {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return DEFAULTS;
    }
  });

  const update = useCallback(<K extends keyof GestureSettings>(key: K, value: GestureSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { gestureSettings: settings, updateGestureSetting: update };
}
