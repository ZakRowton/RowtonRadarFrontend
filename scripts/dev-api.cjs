/**
 * Launches the WeatherRadar FastAPI (uvicorn) on 127.0.0.1:8000.
 * Invoked from npm `dev:api` / `dev:all` so the Next /__api rewrite can reach a live backend.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
const backendDir = path.join(__dirname, "..", "..", "backend");
const venvDir = path.join(backendDir, ".venv");
const winPy = path.join(venvDir, "Scripts", "python.exe");
const nixPy = [path.join(venvDir, "bin", "python3"), path.join(venvDir, "bin", "python")].find(
  (p) => fs.existsSync(p)
);
const python = isWin ? winPy : nixPy;

if (!python || !fs.existsSync(python)) {
  console.error(
    `[dev-api] Missing venv at ${isWin ? winPy : nixPy ?? "..."}. Create the backend venv and install dependencies first.`
  );
  process.exit(1);
}

const child = spawn(
  python,
  ["-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
  {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
  }
);
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
