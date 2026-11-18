import { useEffect, useState } from "react";
import { TABS, useUI, type TabId } from "./app/ui";
import { BoardTab } from "./features/board/BoardTab";
import { HabitsTab } from "./features/habits/HabitsTab";
import { ObsidianTab } from "./features/obsidian/ObsidianTab";
import { ScreensaverTab } from "./features/screensaver/ScreensaverTab";
import { TimerTab } from "./features/timer/TimerTab";
import { TodayTab } from "./features/today/TodayTab";
import { cx } from "./lib/cx";
import { useVault } from "./vault/store";

const PANELS: Record<TabId, () => React.JSX.Element> = {
  timerTab: TimerTab,
  todayTab: TodayTab,
  boardTab: BoardTab,
  habitTab: HabitsTab,
  vaultTab: ObsidianTab,
  saverTab: ScreensaverTab,
};

const REFRESH_THROTTLE = 5000;

const CORNER_BTN = "rounded-[10px] bg-brand px-[19px] py-3 text-sm font-bold text-white opacity-85 max-sm:px-3 max-sm:py-2";

function TextSizeButton() {
  const textSize = useUI((s) => s.textSize);
  const toggle = useUI((s) => s.toggleTextSize);
  const compact = textSize === "compact";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={compact}
      title={compact ? "Switch to large text (phone)" : "Switch to compact text (laptop)"}
      className={CORNER_BTN}
    >
      {compact ? "A+" : "A−"}
      <span className="max-sm:hidden"> {compact ? "LARGE" : "COMPACT"}</span>
    </button>
  );
}

function useIsFullscreen(): boolean {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return full;
}

function FullscreenButton() {
  const toggle = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      else await document.exitFullscreen();
    } catch (e) {
      console.error("Fullscreen error:", e);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title="Full screen"
      className={cx(CORNER_BTN, "[:fullscreen_&]:hidden")}
    >
      ⛶<span className="max-sm:hidden"> EXPAND</span>
    </button>
  );
}

export function App() {
  const tab = useUI((s) => s.tab);
  const setTab = useUI((s) => s.setTab);
  const init = useVault((s) => s.init);
  // Screensaver in expand mode: hide the tabs and corner buttons so it fills the screen (Esc brings them back)
  const immersive = useIsFullscreen() && tab === "saverTab";

  useEffect(() => {
    void init();
  }, [init]);

  // Re-read the vault when you come back to the page, so edits made in Obsidian show up
  useEffect(() => {
    let last = 0;
    const onFocus = () => {
      const vault = useVault.getState();
      if (vault.status !== "ready" || Date.now() - last < REFRESH_THROTTLE) return;
      last = Date.now();
      void vault.refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <>
      <nav
        role="tablist"
        hidden={immersive}
        className="flex h-[58px] items-center gap-2 overflow-x-auto border-b border-line pr-[290px] pl-[clamp(15px,3vw,40px)] [scrollbar-width:none] max-sm:pr-32 short:h-[46px]"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "rounded-[10px] border px-4 py-[9px] text-sm font-bold tracking-wide whitespace-nowrap short:px-3 short:py-1.5",
              tab === t.id ? "border-line bg-panel text-ink" : "border-transparent bg-transparent text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Every tab stays mounted (just hidden) so the timer keeps running and the editor keeps its state */}
      {TABS.map((t) => {
        const Panel = PANELS[t.id];
        return (
          <main
            key={t.id}
            role="tabpanel"
            hidden={tab !== t.id}
            className={cx(
              "w-full overflow-y-auto",
              immersive ? "h-dvh" : "h-[calc(100dvh-58px)] short:h-[calc(100dvh-46px)]",
            )}
          >
            <Panel />
          </main>
        );
      })}

      <div hidden={immersive} className="fixed top-[calc(15px+env(safe-area-inset-top,0px))] right-[15px] z-[100] flex gap-2 max-sm:top-[calc(9px+env(safe-area-inset-top,0px))]">
        <TextSizeButton />
        <FullscreenButton />
      </div>
    </>
  );
}
