// Stop whatever is listening on Deskboard's ports (default: backend 8787, Vite 5173).
//   npm run kill-ports            -> 8787 and 5173
//   npm run kill-ports -- 8787    -> just these ports
//
// On Windows a port can stay open after its process exits: uvicorn --reload hands the
// socket to a worker process, which keeps it open as an orphan. So this stops the
// listener's whole process tree, plus any process whose parent is the (possibly dead)
// listener, and repeats until the ports are free.

import { execFileSync } from "node:child_process";

const ports = process.argv.slice(2).map(Number).filter(Boolean);
if (!ports.length) ports.push(8787, 5173);

const isWindows = process.platform === "win32";
const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};

/** PIDs listening on any of the ports (may include PIDs that already exited). */
function listeners() {
  const pids = new Set();
  if (isWindows) {
    for (const line of run("netstat", ["-ano", "-p", "TCP"]).split("\n")) {
      const m = line.trim().match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
      if (m && ports.includes(Number(m[1])) && m[2] !== "0") pids.add(Number(m[2]));
    }
  } else {
    for (const port of ports)
      for (const pid of run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]).split(/\s+/)) if (pid) pids.add(Number(pid));
  }
  return pids;
}

/** Windows: [pid, parentPid] for every running process. */
function processTable() {
  const out = run("powershell", [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }",
  ]);
  return out
    .split("\n")
    .map((l) => l.trim().split(" ").map(Number))
    .filter(([pid, parent]) => pid && parent >= 0);
}

function kill(pids) {
  if (!isWindows) {
    if (pids.size) run("kill", ["-9", ...[...pids].map(String)]);
    return;
  }
  // the listener itself (if still alive) and its children, even when the listener is gone
  const table = processTable();
  const targets = new Set(table.filter(([pid, parent]) => pids.has(pid) || pids.has(parent)).map(([pid]) => pid));
  for (const pid of targets) run("taskkill", ["/PID", String(pid), "/T", "/F"]);
}

const portList = ports.join(", ");
for (let attempt = 1; attempt <= 5; attempt++) {
  const pids = listeners();
  if (!pids.size) {
    console.log(attempt === 1 ? `Nothing is listening on ${portList}.` : `Ports ${portList} are free.`);
    process.exit(0);
  }
  console.log(`Stopping ${[...pids].map((p) => `PID ${p}`).join(", ")} (ports ${portList})…`);
  kill(pids);
  await new Promise((r) => setTimeout(r, 800));
}

console.error(`Some ports are still in use: ${[...listeners()].join(", ")}. Try again, or restart Windows.`);
process.exit(1);
