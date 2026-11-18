import { create } from "zustand";
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

interface TimerState {
  mode: TimerMode;
  remaining: number;
  running: boolean;
  sessions: number;
  soundOn: boolean;
  /** Timestamp the current run ends at; null while paused. Keeps it accurate in background tabs. */
  endAt: number | null;
  startPause: () => void;
  setMode: (mode: TimerMode) => void;
  reset: () => void;
  skip: () => void;
  toggleSound: () => void;
}

let ticker: ReturnType<typeof setInterval> | undefined;

function stopTicker(): void {
  clearInterval(ticker);
  ticker = undefined;
}

/**
 * Pomodoro timer state, shared app-wide (the Timer tab drives it, the Screensaver shows it).
 * Uses an end timestamp so it stays accurate when the tab is in the background.
 */
export const useTimerStore = create<TimerState>()((set, get) => {
  const complete = () => {
    stopTicker();
    const { mode, sessions, soundOn } = get();
    const next = mode === "focus" ? sessions + 1 : sessions;
    if (mode === "focus") writeString(KEYS.sessions, String(next));
    set({ running: false, endAt: null, remaining: 0, sessions: next });
    if (soundOn) beep();
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Pomodoro complete", { body: `${MODE_LABELS[mode]} finished.` });
    }
  };

  const tick = () => {
    const { endAt } = get();
    if (endAt === null) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (left === 0) complete();
    else set({ remaining: left });
  };

  const setMode = (mode: TimerMode) => {
    stopTicker();
    set({ mode, running: false, endAt: null, remaining: DURATIONS[mode] });
  };

  return {
    mode: "focus",
    remaining: DURATIONS.focus,
    running: false,
    sessions: Number(readString(KEYS.sessions, "0")) || 0,
    soundOn: false,
    endAt: null,

    startPause() {
      const { running, endAt, remaining } = get();
      if (running) {
        stopTicker();
        const left = endAt === null ? remaining : Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        set({ running: false, endAt: null, remaining: left });
        return;
      }
      if (remaining === 0) return;
      set({ running: true, endAt: Date.now() + remaining * 1000 });
      stopTicker();
      ticker = setInterval(tick, 250);
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
    },

    setMode,

    reset() {
      setMode(get().mode);
    },

    skip() {
      const { mode, sessions } = get();
      if (mode === "focus") setMode(sessions > 0 && sessions % 4 === 0 ? "long" : "short");
      else setMode("focus");
    },

    toggleSound() {
      const on = !get().soundOn;
      if (on) void getAudio()?.resume();
      set({ soundOn: on });
    },
  };
});

export const timerProgress = (mode: TimerMode, remaining: number): number =>
  Math.max(0, Math.min(100, ((DURATIONS[mode] - remaining) / DURATIONS[mode]) * 100));

/** Timer state plus derived progress/status, for the Timer tab. */
export function useTimer() {
  const s = useTimerStore();
  const progress = timerProgress(s.mode, s.remaining);
  const status = s.running
    ? `${MODE_LABELS[s.mode]} IN PROGRESS`
    : s.remaining === 0
      ? "SESSION COMPLETE"
      : `READY TO ${s.mode.toUpperCase()}`;
  return { ...s, progress, status };
}

/** Resets the shared timer between tests. */
export function resetTimerForTests(): void {
  stopTicker();
  useTimerStore.setState({ mode: "focus", remaining: DURATIONS.focus, running: false, endAt: null, soundOn: false });
}

export const formatCountdown = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
