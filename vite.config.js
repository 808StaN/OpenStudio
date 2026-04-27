import { spawn } from "node:child_process";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packsDir = path.resolve(__dirname, "public", "packs");

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".wav" || ext === ".wave") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".flac") return "audio/flac";
  if (ext === ".aif" || ext === ".aiff") return "audio/aiff";
  if (ext === ".mid" || ext === ".midi") return "audio/midi";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function resolvePackFilePath(rawUrl) {
  let pathname = "";
  try {
    pathname = new URL(rawUrl || "", "http://openstudio.local").pathname;
  } catch {
    return "";
  }

  if (!pathname.startsWith("/packs/")) {
    return "";
  }

  let relative = "";
  try {
    relative = decodeURIComponent(pathname.replace(/^\/packs\//, ""));
  } catch {
    return "";
  }

  if (!relative) {
    return "";
  }

  const resolved = path.resolve(packsDir, relative);
  const rootWithSep = packsDir.endsWith(path.sep) ? packsDir : packsDir + path.sep;
  if (
    resolved !== packsDir &&
    !resolved.toLowerCase().startsWith(rootWithSep.toLowerCase())
  ) {
    return "";
  }

  return resolved;
}

function runRefreshPacks() {
  const scriptPath = path.resolve(
    __dirname,
    "scripts",
    "generate-packs-manifest.mjs",
  );

  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", function (chunk) {
      stdout += String(chunk);
    });
    child.stderr.on("data", function (chunk) {
      stderr += String(chunk);
    });

    child.on("error", function (error) {
      reject(error);
    });

    child.on("close", function (code) {
      if (code === 0) {
        resolve({ stdout });
        return;
      }

      const message =
        stderr.trim() || stdout.trim() || "refresh:packs failed";
      reject(new Error(message));
    });
  });
}

function packsRescanPlugin() {
  return {
    name: "openstudio-packs-rescan",
    configureServer(server) {
      server.middlewares.use(async function (req, res, next) {
        if (
          req.url !== "/__openstudio/refresh-packs" ||
          req.method !== "POST"
        ) {
          next();
          return;
        }

        try {
          await runRefreshPacks();
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              ok: false,
              error: String(error?.message || "rescan failed"),
            }),
          );
        }
      });
    },
  };
}

function packsFileServerPlugin() {
  return {
    name: "openstudio-packs-file-server",
    configureServer(server) {
      server.middlewares.use(async function (req, res, next) {
        if (!req.url?.startsWith("/packs/")) {
          next();
          return;
        }

        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const filePath = resolvePackFilePath(req.url);
        if (!filePath) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        try {
          const stat = await fs.stat(filePath);
          if (!stat.isFile()) {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }

          // Vite's public-file middleware does not resolve every escaped
          // character consistently, so packs are served from decoded paths here.
          res.statusCode = 200;
          res.setHeader("content-type", getMimeType(filePath));
          res.setHeader("content-length", String(stat.size));
          res.setHeader("cache-control", "no-cache");
          if (req.method === "HEAD") {
            res.end();
            return;
          }

          createReadStream(filePath).pipe(res);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [packsFileServerPlugin(), react(), packsRescanPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep node_modules in a separate vendor chunk so browser caching
          // is independent of application code changes.
          if (id.includes("node_modules")) {
            // lamejs is only needed for MP3 export; keep it isolated.
            if (id.includes("lamejs")) {
              return "lamejs";
            }
            return "vendor";
          }
        },
      },
    },
  },
});
