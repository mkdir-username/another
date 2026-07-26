import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Avd, BootStage, EmulatorStatus } from "../types";

/** Installed AVDs change about once a month, and every poll spawns the emulator binary. */
const REFRESH_MS = 30000;

export function useAvds(showToast: (msg: string, type?: "error" | "info") => void) {
  const [avds, setAvds] = useState<Avd[]>([]);
  const [startingName, setStartingName] = useState<string | null>(null);
  const [stage, setStage] = useState<BootStage | null>(null);
  const startingRef = useRef<string | null>(null);

  const refreshAvds = useCallback(async () => {
    try {
      setAvds(await invoke<Avd[]>("list_avds"));
    } catch {
      // No SDK installed is a normal state — the device list stays the only path.
      setAvds([]);
    }
  }, []);

  useEffect(() => {
    refreshAvds();
    const interval = setInterval(refreshAvds, REFRESH_MS);
    return () => clearInterval(interval);
  }, [refreshAvds]);

  useEffect(() => {
    const unlisten = listen<EmulatorStatus>("emulator-status", (event) => {
      if (event.payload.name === startingRef.current) setStage(event.payload.stage);
    });
    return () => { unlisten.then((off) => off()); };
  }, []);

  const startAvd = useCallback(async (name: string, headless = true): Promise<string | null> => {
    setStartingName(name);
    startingRef.current = name;
    setStage(null);
    try {
      const serial = await invoke<string>("start_avd", { name, headless });
      await refreshAvds();
      return serial;
    } catch (e) {
      showToast(`${e}`);
      return null;
    } finally {
      setStartingName(null);
      startingRef.current = null;
      setStage(null);
    }
  }, [refreshAvds, showToast]);

  const stopAvd = useCallback(async (serial: string) => {
    try {
      await invoke("stop_avd", { serial });
      await refreshAvds();
    } catch (e) {
      showToast(`${e}`);
    }
  }, [refreshAvds, showToast]);

  return { avds, startingName, stage, startAvd, stopAvd, refreshAvds };
}
