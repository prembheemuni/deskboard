import { useEffect, useRef, useState } from "react";
import { formatCountdown, MODE_LABELS, timerProgress, useTimerStore } from "../timer/useTimer";

// Colours the clock cycles through on every edge hit (theme tokens from styles.css)
const COLORS = [
  "var(--color-progress)",
  "var(--color-violet)",
  "var(--color-warn)",
  "var(--color-mint)",
  "var(--color-danger-ink)",
  "var(--color-soft)",
];

const SPEED = 110; // px per second
const REDUCED_SPEED = 35;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** A clock (or the running Pomodoro countdown) that bounces off the edges, changing colour on each hit. */
export function ClockSaver({ active }: { active: boolean }) {
  const now = useNow();
  const timer = useTimerStore();
  const [colorIndex, setColorIndex] = useState(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  // Position and direction survive tab switches so it picks up where it left off
  const state = useRef({ x: 40, y: 40, dx: 1, dy: 1, placed: false });

  useEffect(() => {
    if (!active) return;
    const area = areaRef.current;
    const clock = clockRef.current;
    if (!area || !clock) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const speed = reduced ? REDUCED_SPEED : SPEED;
    const s = state.current;

    if (!s.placed) {
      // start somewhere random, heading at a diagonal
      s.x = Math.random() * Math.max(0, area.clientWidth - clock.offsetWidth);
      s.y = Math.random() * Math.max(0, area.clientHeight - clock.offsetHeight);
      s.dx = Math.random() < 0.5 ? -1 : 1;
      s.dy = Math.random() < 0.5 ? -1 : 1;
      s.placed = true;
    }

    let frame = 0;
    let last = -1; // first frame just records the timestamp

    const step = (t: number) => {
      // clamp the time step so a stalled frame (e.g. background tab) doesn't teleport the clock
      const dt = last < 0 ? 0 : Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;

      const maxX = Math.max(0, area.clientWidth - clock.offsetWidth);
      const maxY = Math.max(0, area.clientHeight - clock.offsetHeight);
      const k = speed * dt * Math.SQRT1_2;
      s.x += s.dx * k;
      s.y += s.dy * k;

      let bounced = false;
      if (s.x <= 0) [s.x, s.dx, bounced] = [0, 1, true];
      else if (s.x >= maxX) [s.x, s.dx, bounced] = [maxX, -1, true];
      if (s.y <= 0) [s.y, s.dy, bounced] = [0, 1, true];
      else if (s.y >= maxY) [s.y, s.dy, bounced] = [maxY, -1, true];
      if (bounced) setColorIndex((i) => (i + 1) % COLORS.length);

      clock.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  const color = COLORS[colorIndex];
  const time = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short" });

  // While a Pomodoro is running the countdown takes over; the clock drops to the small line
  const big = timer.running ? formatCountdown(timer.remaining) : time;
  const small = timer.running ? `${MODE_LABELS[timer.mode]} · ${time}` : date;

  return (
    <div ref={areaRef} className="relative h-full w-full overflow-hidden">
      <div
        ref={clockRef}
        data-testid="bouncing-clock"
        className="absolute top-0 left-0 select-none text-center whitespace-nowrap will-change-transform"
        style={{ color, transition: "color 600ms ease" }}
      >
        <div
          className="text-[clamp(56px,12vw,180px)] leading-none font-[850] tracking-[-0.06em] tabular-nums"
          style={{ textShadow: `0 0 40px color-mix(in srgb, ${color} 45%, transparent)` }}
        >
          {big}
        </div>
        <div className="mt-2 text-[clamp(14px,2vw,26px)] font-[650] tracking-[0.12em] uppercase opacity-80">{small}</div>
        {timer.running && (
          <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
            <div
              className="h-full rounded-full transition-[width] duration-250 ease-linear"
              style={{ width: `${timerProgress(timer.mode, timer.remaining)}%`, background: color }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
