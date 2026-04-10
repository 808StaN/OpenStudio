import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const buildDir = path.resolve(rootDir, "build");

const SIDEBAR_WIDTH = 164;
const SIDEBAR_HEIGHT = 314;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "");
  const value = raw.length === 3
    ? raw
        .split("")
        .map(function (ch) {
          return ch + ch;
        })
        .join("")
    : raw.padStart(6, "0").slice(0, 6);

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function writeBmp24(filePath, width, height, pixelAt) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelArraySize = rowSize * height;
  const headerSize = 54;
  const fileSize = headerSize + pixelArraySize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write("BM", 0, 2, "ascii");
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(headerSize, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(0, 30);
  buffer.writeUInt32LE(pixelArraySize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  buffer.writeUInt32LE(0, 46);
  buffer.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    const rowOffset = headerSize + y * rowSize;

    for (let x = 0; x < width; x += 1) {
      const { r, g, b } = pixelAt(x, srcY);
      const offset = rowOffset + x * 3;
      buffer[offset] = clampByte(b);
      buffer[offset + 1] = clampByte(g);
      buffer[offset + 2] = clampByte(r);
    }
  }

  return writeFile(filePath, buffer);
}

const top = hexToRgb("#121e36");
const bottom = hexToRgb("#070d19");
const accent = hexToRgb("#6fd18b");
const accentSecondary = hexToRgb("#4ca3ff");

function sidebarPixelAt(x, y) {
  const t = y / Math.max(1, SIDEBAR_HEIGHT - 1);
  let r = lerp(top.r, bottom.r, t);
  let g = lerp(top.g, bottom.g, t);
  let b = lerp(top.b, bottom.b, t);

  const glowCenterX = SIDEBAR_WIDTH * 0.18;
  const glowCenterY = SIDEBAR_HEIGHT * 0.28;
  const dx = x - glowCenterX;
  const dy = y - glowCenterY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const glow = Math.max(0, 1 - dist / 120);

  r += glow * 10;
  g += glow * 26;
  b += glow * 38;

  const stripeY = SIDEBAR_HEIGHT * 0.73;
  const stripeBand = Math.max(0, 1 - Math.abs(y - stripeY) / 20);
  r = lerp(r, accent.r, stripeBand * 0.22);
  g = lerp(g, accent.g, stripeBand * 0.22);
  b = lerp(b, accent.b, stripeBand * 0.22);

  const edgeBand = Math.max(0, 1 - Math.abs(x - SIDEBAR_WIDTH * 0.95) / 18);
  r = lerp(r, accentSecondary.r, edgeBand * 0.15);
  g = lerp(g, accentSecondary.g, edgeBand * 0.15);
  b = lerp(b, accentSecondary.b, edgeBand * 0.15);

  return { r, g, b };
}

await mkdir(buildDir, { recursive: true });
await writeBmp24(
  path.resolve(buildDir, "installerSidebar.bmp"),
  SIDEBAR_WIDTH,
  SIDEBAR_HEIGHT,
  sidebarPixelAt,
);
await writeBmp24(
  path.resolve(buildDir, "uninstallerSidebar.bmp"),
  SIDEBAR_WIDTH,
  SIDEBAR_HEIGHT,
  sidebarPixelAt,
);

console.log("Installer sidebar assets generated in:", buildDir);
