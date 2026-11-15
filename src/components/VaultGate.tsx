import type { ReactNode } from "react";
import { useVault } from "../vault/store";
import { Button } from "./ui";

/**
 * Shown by the vault tabs until the vault is ready: explains what to do and offers
 * "Choose vault folder" / "Reconnect". Renders children once notes are loaded.
 */
export function VaultGate({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { status, handle, progress, error, pick, reconnect } = useVault();

  if (status === "ready") return <>{children}</>;

  let text: ReactNode = description;
  if (status === "unsupported") text = "This browser can't open local folders. Open Deskboard in Chrome or Edge.";
  if (status === "loading") text = progress ? `Reading notes… ${progress}` : "Reading notes…";
  if (status === "init") text = "Checking for your vault…";
  if (status === "error") text = `Couldn't open the vault: ${error ?? "unknown error"}`;

  const canPick = status === "disconnected" || status === "reconnect" || status === "error";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 p-5 text-center text-muted">
      <h2 className="m-0 text-2xl font-bold text-ink">{title}</h2>
      <p className="m-0 w-full max-w-[460px] leading-relaxed">{text}</p>
      {status === "reconnect" && handle && (
        <Button onClick={() => void reconnect()}>RECONNECT TO “{handle.name}”</Button>
      )}
      {canPick && (
        <Button variant="primary" onClick={() => void pick()}>
          {status === "reconnect" ? "CHOOSE A DIFFERENT FOLDER" : "CHOOSE VAULT FOLDER"}
        </Button>
      )}
    </div>
  );
}
