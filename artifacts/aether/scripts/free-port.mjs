// Frees $PORT before the dev server starts. Replit's Stop can orphan the
// vite child process (killing only pnpm), leaving the port bound and making
// the next Run fail with "Port already in use".
import { readFileSync, readdirSync, readlinkSync } from "node:fs";

const port = Number(process.env.PORT);
if (!port) process.exit(0);

const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
const inodes = new Set();

for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const line of text.split("\n").slice(1)) {
    const cols = line.trim().split(/\s+/);
    // cols: sl, local_address, rem_address, st, ..., inode at index 9
    if (cols.length < 10) continue;
    if (cols[3] === "0A" && cols[1].endsWith(`:${hexPort}`)) inodes.add(cols[9]);
  }
}

if (!inodes.size) process.exit(0);

for (const entry of readdirSync("/proc")) {
  if (!/^\d+$/.test(entry)) continue;
  const pid = Number(entry);
  if (pid <= 1 || pid === process.pid) continue;
  let fds = [];
  try {
    fds = readdirSync(`/proc/${pid}/fd`);
  } catch {
    continue;
  }
  for (const fd of fds) {
    let link = "";
    try {
      link = readlinkSync(`/proc/${pid}/fd/${fd}`);
    } catch {
      continue;
    }
    if ([...inodes].some((inode) => link === `socket:[${inode}]`)) {
      console.log(`[free-port] matando proceso ${pid} que retenía el puerto ${port}`);
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      break;
    }
  }
}

// give the kernel a moment to release the socket
await new Promise((resolve) => setTimeout(resolve, 300));
