// An in-memory vault behind a fake `fetch` that answers the backend's API
// (backend/app/routes/notes.py), so stores and components can be tested without a server.

import { vi } from "vitest";

type Entry = FakeDir | FakeFile;

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

let clock = 1_000;

export class FakeFile {
  readonly kind = "file";
  constructor(
    readonly name: string,
    public text: string,
    public mtime = ++clock,
  ) {}
}

export class FakeDir {
  readonly kind = "directory";
  constructor(
    readonly name: string,
    readonly children: Record<string, Entry> = {},
  ) {}

  /** Get a file by "a/b/c.md" path (test convenience). */
  file(path: string): FakeFile | undefined {
    const parts = path.split("/");
    const dir = this.dir(parts.slice(0, -1));
    const f = dir?.children[parts[parts.length - 1]];
    return f instanceof FakeFile ? f : undefined;
  }

  dir(parts: string[], create = false): FakeDir | undefined {
    let dir: FakeDir = this;
    for (const p of parts) {
      let next = dir.children[p];
      if (!next && create) next = dir.children[p] = new FakeDir(p);
      if (!(next instanceof FakeDir)) return undefined;
      dir = next;
    }
    return dir;
  }
}

export const dir = (name: string, children: Record<string, Entry> = {}) => new FakeDir(name, children);
export const file = (name: string, text: string) => new FakeFile(name, text);

const lf = (t: string) => t.replace(/\r\n/g, "\n");

function scan(d: FakeDir, prefix: string, out: { path: string; name: string; folder: string; text: string; mtime: number }[]) {
  for (const [name, e] of Object.entries(d.children)) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (e instanceof FakeDir) scan(e, path, out);
    else if (name.endsWith(".md") && !name.endsWith(".excalidraw.md"))
      out.push({ path, name: name.replace(/\.md$/, ""), folder: prefix, text: lf(e.text), mtime: e.mtime });
  }
  return out;
}

const reply = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;

interface WriteBody {
  path: string;
  text: string;
  createFolder?: boolean;
  crlf?: boolean;
  base?: { text: string; mtime: number } | null;
}

function handle(root: FakeDir, url: URL, init?: RequestInit): Response {
  const method = init?.method ?? "GET";
  const route = `${method} ${url.pathname}`;

  if (route === "GET /api/vault") return reply(200, { status: "ready", name: root.name, path: `/vaults/${root.name}` });
  if (route === "GET /api/notes") return reply(200, scan(root, "", []).sort((a, b) => a.path.localeCompare(b.path)));

  if (route === "GET /api/file") {
    const f = root.file(url.searchParams.get("path") ?? "");
    return reply(
      200,
      f
        ? { text: lf(f.text), mtime: f.mtime, exists: true, crlf: f.text.includes("\r\n") }
        : { text: "", mtime: 0, exists: false, crlf: false },
    );
  }

  if (route === "PUT /api/file") {
    const body = JSON.parse(String(init!.body)) as WriteBody;
    const parts = body.path.split("/");
    const name = parts.pop()!;
    let folder = root.dir(parts);
    if (!folder) {
      if (!body.createFolder)
        return reply(409, { code: "folder_missing", message: "folder missing", folder: parts.join("/") });
      folder = root.dir(parts, true)!;
    }
    const existing = root.file(body.path);
    if (body.base && existing && lf(existing.text) !== body.base.text && existing.mtime > body.base.mtime) {
      const disk = { text: lf(existing.text), mtime: existing.mtime, exists: true, crlf: existing.text.includes("\r\n") };
      return reply(409, { code: "conflict", message: "changed on disk", disk });
    }
    const f = existing ?? (folder.children[name] = new FakeFile(name, ""));
    f.text = body.crlf ? body.text.replace(/\n/g, "\r\n") : body.text;
    f.mtime = ++clock;
    return reply(200, { mtime: f.mtime });
  }

  return reply(404, { message: `No route: ${route}` });
}

/** Point `fetch` at this in-memory vault. */
export function serveVault(root: FakeDir): void {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) =>
    handle(root, new URL(String(input), "http://localhost"), init),
  );
}

/** Make `fetch` fail as if the server isn't running. */
export function serverDown(): void {
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("Failed to fetch");
  });
}
