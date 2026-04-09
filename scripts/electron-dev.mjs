import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const DEV_URL = "http://127.0.0.1:5173";
const IS_WINDOWS = process.platform === "win32";
const NPM_CMD = IS_WINDOWS ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);
const ELECTRON_BINARY = require("electron");

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function terminateProcessTree(childProcess) {
  if (!childProcess?.pid) {
    return Promise.resolve();
  }

  if (IS_WINDOWS) {
    return new Promise(function (resolve) {
      const killer = spawn(
        "taskkill",
        ["/PID", String(childProcess.pid), "/T", "/F"],
        {
          stdio: "ignore",
          windowsHide: true,
        },
      );
      killer.on("exit", function () {
        resolve();
      });
      killer.on("error", function () {
        resolve();
      });
    });
  }

  try {
    process.kill(-childProcess.pid, "SIGTERM");
  } catch {
    try {
      childProcess.kill("SIGTERM");
    } catch {
      // Ignore termination errors.
    }
  }

  return Promise.resolve();
}

async function waitForVite(maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(DEV_URL, { method: "GET" });
      if (response.ok) {
        return;
      }
    } catch {
      // Vite not up yet.
    }
    await wait(300);
  }

  throw new Error("Vite dev server did not start in time.");
}

const vite = IS_WINDOWS
  ? spawn(
      "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `${NPM_CMD} run dev -- --host 127.0.0.1 --port 5173`,
      ],
      {
        stdio: "inherit",
        env: process.env,
      },
    )
  : spawn(
      NPM_CMD,
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
      {
        stdio: "inherit",
        env: process.env,
        detached: true,
      },
    );

let electron = null;
let stopping = false;

async function stopAll(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;

  await Promise.all([terminateProcessTree(electron), terminateProcessTree(vite)]);
  process.exit(code);
}

process.on("SIGINT", function () {
  void stopAll(0);
});
process.on("SIGTERM", function () {
  void stopAll(0);
});

vite.on("exit", function (code) {
  if (!stopping) {
    void stopAll(code || 0);
  }
});

try {
  await waitForVite();
  const electronEnv = {
    ...process.env,
    ELECTRON_RENDERER_URL: DEV_URL,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electron = spawn(ELECTRON_BINARY, ["electron/main.mjs"], {
    stdio: "inherit",
    env: electronEnv,
    detached: !IS_WINDOWS,
  });

  electron.on("exit", function (code) {
    if (!stopping) {
      void stopAll(code || 0);
    }
  });
} catch (error) {
  console.error(String(error?.message || error));
  void stopAll(1);
}
