// Reading and writing the Obsidian vault through the File System Access API.

import type { DiskFile, Note } from "./types";

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

export class FolderMissingError extends Error {
  readonly folder: string;
  constructor(folder: string) {
    super(`The folder "${folder}" isn't in your vault`);
    this.name = "FolderMissingError";
    this.folder = folder;
  }
}

const isNotFound = (e: unknown): boolean => {
  const name = (e as { name?: string } | null)?.name;
  return name === "NotFoundError" || name === "TypeMismatchError";
};

export const normalizeEol = (text: string): string => text.replace(/\r\n/g, "\n");

export function splitPath(path: string): { dir: string; name: string } {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() ?? "";
  return { dir: parts.join("/"), name };
}

export function noteFromPath(path: string, text: string, mtime: number): Note {
  const { dir, name } = splitPath(path);
  return { path, name: name.replace(/\.md$/, ""), folder: dir, text, mtime };
}

/** Read every markdown note in the vault (skips hidden folders and Excalidraw drawings). */
export async function scanVault(
  root: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<Note[]> {
  const out: Note[] = [];

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of dir.entries()) {
      if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;

      if (handle.kind === "directory") {
        await walk(handle as FileSystemDirectoryHandle, path);
      } else if (name.endsWith(".md") && !name.endsWith(".excalidraw.md")) {
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push(noteFromPath(path, normalizeEol(await file.text()), file.lastModified));
        onProgress?.(out.length);
      }
    }
  }

  await walk(root, "");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function getDir(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of path.split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

/** Read one file. A missing file is not an error: it comes back with exists=false. */
export async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<DiskFile> {
  const { dir, name } = splitPath(path);
  try {
    const folder = await getDir(root, dir, false);
    const file = await (await folder.getFileHandle(name)).getFile();
    const raw = await file.text();
    return { text: normalizeEol(raw), mtime: file.lastModified, exists: true, crlf: raw.includes("\r\n") };
  } catch (e) {
    if (isNotFound(e)) return { text: "", mtime: 0, exists: false, crlf: false };
    throw e;
  }
}

/**
 * Write one file and return its new modified time.
 * The folder is never created silently (a folder moved in Obsidian would otherwise
 * be re-created): pass createFolder to allow it, otherwise FolderMissingError is thrown.
 */
export async function writeFile(
  root: FileSystemDirectoryHandle,
  path: string,
  text: string,
  opts: { createFolder?: boolean; crlf?: boolean } = {},
): Promise<number> {
  const { dir, name } = splitPath(path);
  let folder: FileSystemDirectoryHandle;
  try {
    folder = await getDir(root, dir, !!opts.createFolder);
  } catch (e) {
    if (isNotFound(e)) throw new FolderMissingError(dir);
    throw e;
  }
  const handle = await folder.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(opts.crlf ? text.replace(/\n/g, "\r\n") : text);
  await writable.close();
  return (await handle.getFile()).lastModified;
}
