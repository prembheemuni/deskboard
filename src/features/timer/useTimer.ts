import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, readString, writeString } from "../../lib/storage";

export type TimerMode = "focus" | "short" | "long";

export const DURATIONS: Record<TimerMode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
export const MODE_LABELS: Record<TimerMode, string> = {
  focus: "FOCUS SESSION",
  short: "SHORT BREAK",
  long: "LONG BREAK",
};

let audioContext: AudioContext | null = null;

function getAudio(): AudioContext | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audioContext ??= new Ctx();
  return audioContext;
}

function beep(): void {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch {
    /* sound is optional */
  }
}

/** Pomodoro timer. Uses an end timestamp so it stays accurate when the tab is in the background. */
export function useTimer() {
  const [mode, setModeState] = useState<TimerMode>("focus");
  const [remaining, setRemaining] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(() => Number(readString(KEYS.sessions, "0")) || 0);
  const [soundOn, setSoundOn] = useState(false);
  const endAt = useRef<number | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const complete = useCallback((finished: TimerMode) => {
    setRunning(false);
    endAt.current = null;
    setRemaining(0);
    if (finished === "focus") {
      setSessions((s) => {
        writeString(KEYS.sessions, String(s + 1));
        return s + 1;
      });
    }
    if (soundRef.current) beep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Pomodoro complete", { body: `${MODE_LABELS[finished]} finished.` });
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (endAt.current === null) return;
      const left = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      if (left === 0) complete(mode);
      else setRemaining(left);
    }, 250);
    return () => clearInterval(id);
  }, [running, mode, complete]);

  const startPause = useCallback(() => {
    if (running) {
      if (endAt.current !== null) setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
      endAt.current = null;
      setRunning(false);
      return;
    }
    if (remaining === 0) return;
    endAt.current = Date.now() + remaining * 1000;
    setRunning(true);
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, [running, remaining]);

  const setMode = useCallback((next: TimerMode) => {
    endAt.current = null;
    setRunning(false);
    setModeState(next);
    setRemaining(DURATIONS[next]);
  }, []);

  const reset = useCallback(() => {
    endAt.current = null;
    setRunning(false);
    setRemaining(DURATIONS[mode]);
  }, [mode]);

  const skip = useCallback(() => {
    if (mode === "focus") setMode(sessions > 0 && sessions % 4 === 0 ? "long" : "short");
    else setMode("focus");
  }, [mode, sessions, setMode]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      if (!on) void getAudio()?.resume();
      return !on;
    });
  }, []);

  const progress = Math.max(0, Math.min(100, ((DURATIONS[mode] - remaining) / DURATIONS[mode]) * 100));
  const status = running
    ? `${MODE_LABELS[mode]} IN PROGRESS`
    : remaining === 0
      ? "SESSION COMPLETE"
      : `READY TO ${mode.toUpperCase()}`;

  return { mode, remaining, running, sessions, soundOn, progress, status, startPause, setMode, reset, skip, toggleSound };
}

export const formatCountdown = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
