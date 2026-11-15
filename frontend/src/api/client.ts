// HTTP client for the Deskboard backend (backend/app/routes/notes.py).
// Types come from the backend's OpenAPI schema: run `npm run gen:api` after changing its models.

import type { components } from "./schema";

type Schemas = components["schemas"];
export type Note = Schemas["Note"];
export type DiskFile = Schemas["DiskFile"];
export type VaultInfo = Schemas["VaultInfo"];
export type WriteRequest = Schemas["WriteRequest"];
type ErrorBody = Schemas["ApiErrorBody"];

/** One note changed on disk (sent over /api/events; see FileChange in backend/app/models.py). */
export interface FileChange {
  kind: "changed" | "deleted";
  path: string;
}

/** The backend isn't running or couldn't be reached. */
export class OfflineError extends Error {
  constructor() {
    super("Can't reach the Deskboard server. Is it running? (npm run dev)");
    this.name = "OfflineError";
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorBody["code"] | undefined;
  constructor(status: number, message: string, code?: ErrorBody["code"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** A save would have re-created a folder that isn't in the vault (maybe moved in Obsidian). */
export class FolderMissingError extends ApiError {
  readonly folder: string;
  constructor(body: ErrorBody) {
    super(409, body.message, "folder_missing");
    this.name = "FolderMissingError";
    this.folder = body.folder ?? "";
  }
}

/** The note changed on disk since the version passed as `base`. */
export class ConflictError extends ApiError {
  readonly disk: DiskFile;
  constructor(body: ErrorBody) {
    super(409, body.message, "conflict");
    this.name = "ConflictError";
    this.disk = body.disk!;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OfflineError();
  }
  // the Vite dev proxy answers 502/504 when the backend is down
  if (res.status === 502 || res.status === 504) throw new OfflineError();

  const data: unknown = await res.json().catch(() => null);
  if (res.ok) return data as T;

  const err = (data ?? {}) as Partial<ErrorBody>;
  if (err.code === "folder_missing") throw new FolderMissingError(err as ErrorBody);
  if (err.code === "conflict") throw new ConflictError(err as ErrorBody);
  throw new ApiError(res.status, err.message ?? `Server error (${res.status})`, err.code);
}

export const api = {
  vault: () => request<VaultInfo>("GET", "/api/vault"),
  notes: () => request<Note[]>("GET", "/api/notes"),
  read: (path: string) => request<DiskFile>("GET", `/api/file?path=${encodeURIComponent(path)}`),
  /** Returns the new modified time. Throws FolderMissingError / ConflictError. */
  write: async (req: WriteRequest) => (await request<{ mtime: number }>("PUT", "/api/file", req)).mtime,
};

/**
 * Follow note changes made outside the page (in Obsidian, by sync…).
 * onResync means "reload everything": the server lost track, or the connection dropped for a while.
 */
export function subscribeChanges(onChanges: (changes: FileChange[]) => void, onResync: () => void): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource("/api/events");
  let dropped = false;

  source.addEventListener("changes", (e) => onChanges(JSON.parse((e as MessageEvent<string>).data) as FileChange[]));
  source.addEventListener("resync", () => onResync());
  source.addEventListener("error", () => {
    dropped = true; // EventSource reconnects by itself
  });
  source.addEventListener("open", () => {
    if (dropped) onResync(); // catch up on anything missed while disconnected
    dropped = false;
  });
  return () => source.close();
}
