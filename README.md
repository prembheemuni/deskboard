# Deskboard

A focus dashboard for your desk, built on your Obsidian vault.

Run it on your computer, point it at your vault folder, and you get:

- **Timer** – a large Pomodoro clock that's easy to read from across the room
- **Today** – write today's daily note; it saves straight into your vault
- **Tasks** – a To do / Doing / Done board of the `- [ ]` tasks in your daily notes
- **Obsidian** – browse, search and read your notes

It has two parts: a **frontend** (React, in your browser) and a small **backend** (FastAPI) that reads and
writes the vault folder. Both run on your machine. The server only listens on `127.0.0.1` and only answers
pages served from this computer, so your notes never leave your machine.

## Install

You only do this once. The commands are for PowerShell on Windows; run them from the project folder.

### 1. Install the tools

| Tool | Version | Where to get it | Check with |
|---|---|---|---|
| Node.js | 20 or newer | [nodejs.org](https://nodejs.org) | `node --version` |
| Python | 3.12 or newer | [python.org](https://www.python.org/downloads/): tick **"Add python.exe to PATH"** in the installer | `python --version` |
| uv | any | `python -m pip install uv` | `python -m uv --version` |

If `python` opens the Microsoft Store, turn off the `python.exe` entries under
**Settings → Apps → Advanced app settings → App execution aliases**, then open a new terminal.

The backend runs on Python 3.13. uv downloads its own copy for this project, so it doesn't matter
which Python version you installed.

### 2. Install the app's packages

```powershell
npm run setup
```

This installs the frontend packages (npm) and the backend packages (uv, into `backend\.venv`).

### 3. Tell the backend where your vault is

```powershell
copy backend\.env.example backend\.env
notepad backend\.env
```

Set `DESKBOARD_VAULT_PATH` to your Obsidian vault folder and save. Use forward slashes; spaces are fine:

```ini
DESKBOARD_VAULT_PATH=G:/My Drive/obsidian
```

## Run

```powershell
npm run build    # only needed the first time and after you pull new changes
npm start
```

Open **http://localhost:8787** in any browser. Leave the terminal open while you use the app, and press
`Ctrl+C` there to stop it.

When you edit a note in Obsidian, the page updates by itself.

### Troubleshooting

| You see | Do this |
|---|---|
| "Can't reach the Deskboard server" | The server isn't running: run `npm start` (or `npm run dev`) and click **TRY AGAIN**. |
| "Set your vault folder…" | `backend\.env` is missing or has no `DESKBOARD_VAULT_PATH`. Fix it, then restart the server. |
| "The vault folder … can't be found" | Check the path in `backend\.env`. If the vault is on Google Drive, make sure Google Drive for Desktop is running. |
| Edits made in Obsidian don't show up | Some Google Drive for Desktop setups don't report file changes. Add `DESKBOARD_WATCH_POLLING=true` to `backend\.env` and restart. |
| `uv` "is not recognized" | Run uv as `python -m uv …`; the npm scripts already do. |
| Port 8787 is already in use | Another copy of the server is running. Close that terminal, or stop it from Task Manager (`python.exe`). |

### How tasks map to the board

| Column | In your note | Notes |
|---|---|---|
| To do | `- [ ] task` | |
| Doing | `- [/] task` | Obsidian's "in progress" state |
| Done | `- [x] task ✅ 2026-11-15` | the ✅ date is added/removed automatically |

Due dates written as `📅 2026-11-20` show as a chip (red when overdue). Moving a card rewrites only that
line in the note. Tasks in `Templates` folders, cancelled `[-]` tasks and tasks inside code blocks are ignored.

### Daily notes

Daily notes are `<folder>/YYYY-MM-DD.md` (default folder: `Daily Updates`, changeable in the Today tab).
The page never re-creates a missing folder silently, and it won't overwrite a note you edited in Obsidian
without asking.

## Development

```bash
npm run dev            # backend on :8787 (auto-reload) + Vite on http://localhost:5173 (proxies /api)
npm test               # Vitest (frontend) + pytest (backend)
npm run typecheck
npm run gen:api        # after changing backend/app/models.py: regenerate frontend/src/api/schema.d.ts
```

### Stack

- **Frontend:** Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Zustand · dnd-kit · react-markdown
- **Backend:** Python · FastAPI · Pydantic · watchfiles (live changes) · server-sent events · pytest

### API

| Method | Path | |
|---|---|---|
| GET | `/api/vault` | is the vault folder set and found? |
| GET | `/api/notes` | every note, with its text |
| GET | `/api/file?path=` | one note; a missing note comes back with `exists: false` |
| PUT | `/api/file` | write a note. `409 folder_missing` (never re-creates a moved folder unless `createFolder`), `409 conflict` (changed on disk since `base`) |
| GET | `/api/events` | server-sent events: `changes` / `resync` |

Only `.md` files inside the vault can be read or written; hidden folders (`.obsidian`, `.trash`, …) are off limits.

### Layout

```
backend/
├─ app/main.py             app setup, local-only guard, error responses, serves frontend/dist
├─ app/config.py           settings (backend/.env, DESKBOARD_ prefix)
├─ app/models.py           API shapes: the source of the frontend's types
├─ app/routes/notes.py     the endpoints above
├─ app/vault/              fs.py (read/scan/write), paths.py (path safety), watch.py (live changes)
└─ tests/
frontend/src/
├─ App.tsx                 tab bar; all tabs stay mounted
├─ api/                    client.ts (fetch + change events), schema.d.ts (generated)
├─ app/ui.ts               active tab, open note, sidebar state
├─ lib/                    storage, dates, text-editing helpers
├─ vault/                  the vault store, markdown rendering, wikilinks
├─ components/             Button, AlertBar, VaultGate (server/vault status screen)
└─ features/
   ├─ timer/               clock + Pomodoro
   ├─ today/               daily note editor, auto-save, conflicts
   ├─ board/               task parsing + board
   └─ obsidian/            sidebar tree + note view
```

All edits go through `useVault().write()`, which updates the in-memory notes so every tab re-renders.
