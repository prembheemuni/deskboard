import type { ReactNode } from "react";
import { useVault } from "../vault/store";
import { Button } from "./ui";

/**
 * Shown by the vault tabs until the vault is ready: explains what's wrong with the
 * server or the vault folder and offers "Try again". Renders children once notes are loaded.
 */
export function VaultGate({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const { status, path, error, refresh } = useVault();

  if (status === "ready") return <>{children}</>;

  let text: ReactNode = description;
  if (status === "init") text = "Connecting to your vault…";
  if (status === "loading") text = "Reading notes…";
  if (status === "offline")
    text = (
      <>
        Can't reach the Deskboard server. Start it with <code>npm run dev</code> (or <code>npm start</code>) and try
        again.
      </>
    );
  if (status === "not_configured")
    text = (
      <>
        {description} Set your vault folder as <code>DESKBOARD_VAULT_PATH</code> in <code>backend/.env</code>, for
        example <code>G:/My Drive/obsidian</code>, then restart the server.
      </>
    );
  if (status === "missing")
    text = (
      <>
        The vault folder <code>{path}</code> can't be found. Check <code>DESKBOARD_VAULT_PATH</code> in{" "}
        <code>backend/.env</code> (is Google Drive running?).
      </>
    );
  if (status === "error") text = `Couldn't open the vault: ${error ?? "unknown error"}`;

  const canRetry = status !== "init" && status !== "loading";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 p-5 text-center text-muted">
      <h2 className="m-0 text-2xl font-bold text-ink">{title}</h2>
      <p className="m-0 w-full max-w-[460px] leading-relaxed">{text}</p>
      {canRetry && (
        <Button variant="primary" onClick={() => void refresh()}>
          TRY AGAIN
        </Button>
      )}
    </div>
  );
}
