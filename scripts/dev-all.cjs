/**
 * Starts FastAPI, waits until it actually serves HTTP, then starts Next.js.
 * Replaces concurrently + wait-on tcp:8000, which can pass during uvicorn --reload
 * or before the worker binds → Next proxies to nothing → ECONNREFUSED.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const isWin = process.platform === "win32";
const frontendDir = path.join(__dirname, "..");
const backendDir = path.join(frontendDir, "..", "backend");
const venvDir = path.join(backendDir, ".venv");
const winPy = path.join(venvDir, "Scripts", "python.exe");
const nixPy = [path.join(venvDir, "bin", "python3"), path.join(venvDir, "bin", "python")].find(
  (p) => fs.existsSync(p)
);
const python = isWin ? winPy : nixPy;

const API_READY_URL = "http://127.0.0.1:8000/radar/mesonet-tms";
const READY_TIMEOUT_MS = 120_000;
const READY_INTERVAL_MS = 400;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkApiReady() {
  return new Promise((resolve) => {
    const req = http.get(API_READY_URL, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForApi(apiChild) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  process.stdout.write(
    `[dev-all] Waiting for API (GET ${API_READY_URL}, max ${READY_TIMEOUT_MS / 1000}s)…\n`
  );
  while (Date.now() < deadline) {
    if (apiChild.exitCode !== null) {
      throw new Error("[dev-all] API process exited before it became ready. Check errors above.");
    }
    if (await checkApiReady()) {
      process.stdout.write("[dev-all] API is ready; starting Next.js.\n");
      return;
    }
    await sleep(READY_INTERVAL_MS);
  }
  throw new Error("[dev-all] API did not respond in time.");
}

if (!python || !fs.existsSync(python)) {
  console.error(
    `[dev-all] Missing venv Python at ${python || "unknown"}. Create backend/.venv and install deps.`
  );
  process.exit(1);
}

let apiChild = null;
let webChild = null;

function shutdown() {
  if (webChild && !webChild.killed) {
    try {
      webChild.kill(isWin ? undefined : "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  if (apiChild && !apiChild.killed) {
    try {
      apiChild.kill(isWin ? undefined : "SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => {
  process.on(sig, () => {
    shutdown();
    process.exit(0);
  });
});

async function main() {
  apiChild = spawn(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
    {
      cwd: backendDir,
      stdio: "inherit",
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    }
  );

  apiChild.on("exit", (code) => {
    if (webChild && !webChild.killed) {
      process.stderr.write(`[dev-all] API stopped (code ${code}); stopping Next.js.\n`);
      try {
        webChild.kill(isWin ? undefined : "SIGTERM");
      } catch {
        /* ignore */
      }
    }
  });

  try {
    await waitForApi(apiChild);
  } catch (e) {
    console.error(e.message || e);
    shutdown();
    process.exit(1);
  }

  const nextCli = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");
  if (!fs.existsSync(nextCli)) {
    console.error(`[dev-all] Next CLI not found at ${nextCli}. Run npm install in frontend/.`);
    shutdown();
    process.exit(1);
  }

  webChild = spawn(process.execPath, [nextCli, "dev"], {
    cwd: frontendDir,
    stdio: "inherit",
    env: { ...process.env }
  });

  webChild.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err.message || err);
  shutdown();
  process.exit(1);
});
