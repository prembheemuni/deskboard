// An in-memory stand-in for a FileSystemDirectoryHandle, for tests.

type Entry = FakeDir | FakeFile;

const notFound = () => Object.assign(new Error("not found"), { name: "NotFoundError" });

let clock = 1_000;

export class FakeFile {
  readonly kind = "file";
  constructor(
    readonly name: string,
    public text: string,
    public mtime = ++clock,
  ) {}

  async getFile(): Promise<File> {
    return new File([this.text], this.name, { lastModified: this.mtime });
  }

  async createWritable() {
    let buf = "";
    return {
      write: async (t: string) => {
        buf += t;
      },
      close: async () => {
        this.text = buf;
        this.mtime = ++clock;
      },
    };
  }
}

export class FakeDir {
  readonly kind = "directory";
  constructor(
    readonly name: string,
    readonly children: Record<string, Entry> = {},
  ) {}

  async *entries(): AsyncGenerator<[string, Entry]> {
    for (const [k, v] of Object.entries(this.children)) yield [k, v];
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const e = this.children[name];
    if (e instanceof FakeDir) return e;
    if (e || !opts?.create) throw notFound();
    return (this.children[name] = new FakeDir(name));
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const e = this.children[name];
    if (e instanceof FakeFile) return e;
    if (e || !opts?.create) throw notFound();
    return (this.children[name] = new FakeFile(name, ""));
  }

  async queryPermission(): Promise<PermissionState> {
    return "granted";
  }

  async requestPermission(): Promise<PermissionState> {
    return "granted";
  }

  /** Get a file by "a/b/c.md" path (test convenience). */
  file(path: string): FakeFile | undefined {
    const parts = path.split("/");
    let dir: FakeDir = this;
    for (const p of parts.slice(0, -1)) {
      const next = dir.children[p];
      if (!(next instanceof FakeDir)) return undefined;
      dir = next;
    }
    const f = dir.children[parts[parts.length - 1]];
    return f instanceof FakeFile ? f : undefined;
  }
}

export const dir = (name: string, children: Record<string, Entry> = {}) => new FakeDir(name, children);
export const file = (name: string, text: string) => new FakeFile(name, text);
export const asHandle = (d: FakeDir) => d as unknown as FileSystemDirectoryHandle;
