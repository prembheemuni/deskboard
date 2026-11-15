import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";
import type { AlertMessage, StatusMessage } from "./types";

type Variant = "default" | "primary" | "ghost" | "raised";
/** "bare" sets no padding/size/radius, for callers that supply their own (avoids conflicting classes). */
type Size = "sm" | "md" | "bare";

const VARIANTS: Record<Variant, string> = {
  default: "bg-panel text-soft",
  primary: "bg-brand text-white",
  ghost: "bg-transparent text-muted border-line",
  raised: "bg-raised text-soft",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px] rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  bare: "",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cx(
        "border border-transparent font-bold tracking-wide whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}

export function AlertBar({ alert }: { alert: AlertMessage | null }) {
  if (!alert) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2.5 rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[15px] text-warn"
    >
      <span>{alert.message}</span>
      {alert.actions.map((a) => (
        <Button key={a.label} size="sm" onClick={a.run}>
          {a.label}
        </Button>
      ))}
    </div>
  );
}

export function StatusText({ status, className }: { status: StatusMessage; className?: string }) {
  return (
    <span aria-live="polite" className={cx("text-sm", status.error ? "text-danger" : "text-muted", className)}>
      {status.text}
    </span>
  );
}

export function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "overdue" | "today" }) {
  return (
    <span
      className={cx(
        "rounded-md px-2 py-0.5",
        tone === "overdue" && "bg-danger-bg text-danger-ink",
        tone === "today" && "bg-due-bg text-warn",
        tone === "plain" && "bg-raised",
      )}
    >
      {children}
    </span>
  );
}
