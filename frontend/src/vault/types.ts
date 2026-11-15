/** A markdown note read from the vault. Text is always stored with \n line endings. */
export interface Note {
  /** Path inside the vault, using "/" — e.g. "Daily Updates/2026-11-15.md" */
  path: string;
  /** File name without ".md" */
  name: string;
  /** Folder path ("" for the top of the vault) */
  folder: string;
  text: string;
  /** Last-modified time in ms */
  mtime: number;
}

export interface DiskFile {
  text: string;
  mtime: number;
  exists: boolean;
  /** The file on disk uses Windows (\r\n) line endings */
  crlf: boolean;
}
