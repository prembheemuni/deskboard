import { useEffect, useState } from "react";
import { cx } from "../../lib/cx";
import { formatCountdown, useTimer, type TimerMode } from "./useTimer";

const MODES: { id: TimerMode; label: string }[] = [
  { id: "focus", label: "FOCUS" },
  { id: "short", label: "SHORT BREAK" },
  { id: "long", label: "LONG BREAK" },
];

// Background/colour are passed separately (see btnColors) so classes never conflict
const timerBtn =
  "rounded-xl border px-[1.1em] py-[0.65em] font-bold tracking-wide " +
  "text-timer-btn portrait:text-timer-btn-portrait short:px-[0.9em] short:py-[0.45em]";

const btnColors = {
  normal: "border-transparent bg-panel text-soft",
  active: "border-brand-line bg-brand-deep text-white",
  primary: "border-transparent bg-brand text-white",
};

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Clock() {
  const now = useNow();
  const hour = now.toLocaleTimeString("en-IN", { hour: "2-digit", hour12: false });
  const minute = String(now.getMinutes()).padStart(2, "0");
  const big = "text-clock short:text-clock-short portrait:text-clock-portrait leading-[0.95] font-[850] tracking-[-0.07em] tabular-nums";

  return (
    <section
      className={cx(
        "flex min-w-0 flex-col justify-center border-r-2 border-line pr-[clamp(15px,3vw,45px)]",
        "portrait:items-center portrait:border-r-0 portrait:border-b-2 portrait:pr-0 portrait:pb-3",
      )}
    >
      <div className={big}>{hour}</div>
      <div className={big}>{minute}</div>
      <div className="mt-[clamp(10px,3dvh,35px)] flex flex-col gap-1 portrait:mt-2.5">
        <div className="text-weekday font-[650] text-body">
          {now.toLocaleDateString("en-IN", { weekday: "long" })}
        </div>
        <div className="text-calendar font-[550] text-muted">
          {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </div>
      </div>
      <div className="mt-[clamp(10px,3dvh,30px)] text-zone tracking-[2px] text-faint">HYDERABAD · IST</div>
    </section>
  );
}

export function TimerTab() {
  const t = useTimer();

  return (
    <div
      className={cx(
        "grid h-full w-full items-center gap-fluid",
        "grid-cols-[minmax(150px,.48fr)_minmax(0,2fr)] px-[clamp(20px,4vw,65px)] py-[clamp(12px,3dvh,50px)]",
        "short:grid-cols-[minmax(120px,.45fr)_minmax(0,2fr)] short:gap-[3vw] short:px-[3vw] short:py-2",
        "portrait:grid-cols-1 portrait:grid-rows-[auto_1fr] portrait:gap-3 portrait:p-5 portrait:text-center",
      )}
    >
      <Clock />

      <section className="min-w-0 text-center">
        <div className="flex flex-wrap items-center justify-center gap-[clamp(8px,1vw,14px)]">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => t.setMode(m.id)}
              aria-pressed={t.mode === m.id}
              className={cx(timerBtn, t.mode === m.id ? btnColors.active : btnColors.normal)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-fluid text-timer-status font-[650] tracking-[0.16em] text-muted">{t.status}</div>

        <div
          className={cx(
            "mt-[1dvh] mb-[2dvh] whitespace-nowrap leading-[0.98] font-[850] tracking-[-0.075em] tabular-nums",
            "text-countdown short:text-countdown-short portrait:text-countdown-portrait short:mt-0 short:mb-1.5",
          )}
          aria-live="off"
        >
          {formatCountdown(t.remaining)}
        </div>

        <div className="mx-auto mb-[clamp(10px,3dvh,30px)] h-[clamp(8px,1.6dvh,16px)] w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-progress transition-[width] duration-250 ease-linear" style={{ width: `${t.progress}%` }} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-[clamp(8px,1vw,14px)]">
          <button type="button" className={cx(timerBtn, btnColors.normal, "min-w-[5.5em]")} onClick={t.reset}>RESET</button>
          <button type="button" className={cx(timerBtn, btnColors.primary, "min-w-[8em]")} onClick={t.startPause}>
            {t.running ? "PAUSE" : "START"}
          </button>
          <button type="button" className={cx(timerBtn, btnColors.normal, "min-w-[5.5em]")} onClick={t.skip}>SKIP</button>
        </div>

        <div className="mt-fluid text-sessions tracking-[0.12em] text-muted">
          COMPLETED FOCUS SESSIONS: <span>{t.sessions}</span>
        </div>
      </section>

      <button
        type="button"
        onClick={t.toggleSound}
        className="fixed right-[15px] bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-50 rounded-xl bg-panel px-3.5 py-2 text-xs font-bold text-soft opacity-65"
      >
        {t.soundOn ? "SOUND ON" : "SOUND OFF"}
      </button>
    </div>
  );
}
