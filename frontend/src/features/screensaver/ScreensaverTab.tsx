import { useEffect, useState } from "react";
import { useUI } from "../../app/ui";
import { cx } from "../../lib/cx";
import { KEYS, readString, writeString } from "../../lib/storage";
import { CatSaver } from "./CatSaver";
import { ClockSaver } from "./ClockSaver";

const SAVERS = [
  { id: "clock", icon: "🕐", label: "Clock" },
  { id: "cat", icon: "🐱", label: "Cat" },
] as const;

type SaverId = (typeof SAVERS)[number]["id"];

const CURSOR_IDLE_MS = 3000;

/** True after a few seconds without mouse movement (hides the cursor and the switcher). */
function useIdle(active: boolean): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) return;
    let timer = setTimeout(() => setIdle(true), CURSOR_IDLE_MS);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), CURSOR_IDLE_MS);
    };
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      setIdle(false);
    };
  }, [active]);
  return idle;
}

export function ScreensaverTab() {
  const active = useUI((s) => s.tab === "saverTab");
  const idle = useIdle(active);
  const [saver, setSaverState] = useState<SaverId>(() => (readString(KEYS.saverMode, "clock") === "cat" ? "cat" : "clock"));

  const setSaver = (id: SaverId) => {
    writeString(KEYS.saverMode, id);
    setSaverState(id);
  };

  return (
    <div className={cx("relative h-full w-full overflow-hidden bg-black", idle && "cursor-none")}>
      {saver === "clock" ? <ClockSaver active={active} /> : <CatSaver active={active} />}

      <div
        role="radiogroup"
        aria-label="Screensaver"
        className={cx(
          "absolute bottom-[calc(14px+env(safe-area-inset-bottom,0px))] right-[15px] z-10 flex gap-1 rounded-xl border border-line bg-panel/80 p-1 transition-opacity duration-500",
          idle ? "pointer-events-none opacity-0" : "opacity-80",
        )}
      >
        {SAVERS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={saver === s.id}
            aria-label={s.label}
            title={s.label}
            onClick={() => setSaver(s.id)}
            className={cx(
              "grid h-9 w-9 place-items-center rounded-lg text-lg",
              saver === s.id ? "bg-raised" : "opacity-55 hover:opacity-100",
            )}
          >
            {s.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
