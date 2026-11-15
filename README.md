# Deskboard

A focus dashboard for your desk, built on your Obsidian vault.

Open it in Chrome or Edge, point it at your vault folder, and you get:

- **Timer** – a large Pomodoro clock that's easy to read from across the room
- **Today** – write today's daily note; it saves straight into your vault
- **Tasks** – a To do / Doing / Done board of the `- [ ]` tasks in your daily notes
- **Obsidian** – browse, search and read your notes

Everything runs locally in your browser using the File System Access API.
No server, no account, and your notes never leave your machine.

## Using it

Download or build `dist/index.html` and open it in **Chrome or Edge** (other browsers can't open local folders).
On first use, pick your vault folder; it's remembered after that. Saving and moving tasks needs edit
permission, which the browser asks for once.

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

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: logic, store workflows and component tests
npm run typecheck
npm run build      # → dist/index.html (single self-contained file)
```

### Stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Zustand · dnd-kit · react-markdown

### Layout

```
src/
├─ App.tsx                 tab bar; all tabs stay mounted
├─ styles.css              Tailwind theme, fluid text-size utilities, note styles
├─ app/ui.ts               active tab, open note, sidebar state
├─ lib/                    storage, dates, text-editing helpers
├─ vault/                  File System Access (fs.ts), the vault store, markdown rendering
├─ components/             Button, AlertBar, VaultGate (connect screen)
└─ features/
   ├─ timer/               clock + Pomodoro
   ├─ today/               daily note editor, auto-save, conflicts
   ├─ board/               task parsing + board
   └─ obsidian/            sidebar tree + note view
```

All edits go through `useVault().write()`, which updates the in-memory notes so every tab re-renders.
