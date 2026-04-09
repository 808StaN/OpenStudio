import { spawn } from "node:child_process";

const DEV_URL = "http://127.0.0.1:5173";

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
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

const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

let electron = null;
let stopping = false;

function stopAll(code = 0) {
  if (stopping) {
    return;
  }
  stopping = true;

  if (electron && !electron.killed) {
    electron.kill();
  }
  if (vite && !vite.killed) {
    vite.kill();
  }

  process.exit(code);
}

process.on("SIGINT", function () {
  stopAll(0);
});
process.on("SIGTERM", function () {
  stopAll(0);
});

vite.on("exit", function (code) {
  if (!stopping) {
    stopAll(code || 0);
  }
});

try {
  await waitForVite();

  electron = spawn("npx", ["electron", "electron/main.mjs"], {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: DEV_URL,
    },
  });

  electron.on("exit", function (code) {
    if (!stopping) {
      stopAll(code || 0);
    }
  });
} catch (error) {
  console.error(String(error?.message || error));
  stopAll(1);
}
