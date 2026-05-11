import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const url = process.env.PURPLEPLANET_URL || "http://127.0.0.1:5173/";
const outDir = path.resolve("verification");
const browserPath = findBrowser();

const viewports = [
  { name: "desktop", width: 1920, height: 1080 },
  { name: "portrait", width: 1080, height: 1920 },
  { name: "mobile", width: 390, height: 844 },
  { name: "triple-mixed", width: 4096, height: 1440 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: true,
  args: ["--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});

const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });

    const consoleProblems = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      consoleProblems.push(`pageerror: ${error.message}`);
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#wallpaper").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(900);

    const canvasInfo = await page.locator("#wallpaper").evaluate((canvas) => ({
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      pixelWidth: canvas.width,
      pixelHeight: canvas.height,
    }));

    const screenshotPath = path.join(outDir, `${viewport.name}.png`);
    const screenshot = await page.screenshot({ path: screenshotPath, fullPage: false });
    const metrics = analyzePng(screenshot);
    let motion = null;

    if (viewport.name === "desktop") {
      await page.waitForTimeout(2600);
      const laterPath = path.join(outDir, `${viewport.name}-later.png`);
      const laterScreenshot = await page.screenshot({ path: laterPath, fullPage: false });
      motion = {
        screenshot: laterPath,
        ...comparePng(screenshot, laterScreenshot),
      };
    }

    const checks = {
      canvasCoversViewport:
        canvasInfo.clientWidth === viewport.width && canvasInfo.clientHeight === viewport.height,
      nonBlank: metrics.brightPixels > 800 && metrics.nonDarkRatio > 0.004,
      colorful: metrics.colorSpread > 26 && metrics.colorBuckets > 18,
      noConsoleProblems: consoleProblems.length === 0,
      movingFrame: viewport.name !== "desktop" || motion.changedRatio > 0.012,
    };

    results.push({
      viewport,
      canvasInfo,
      screenshot: screenshotPath,
      metrics,
      motion,
      checks,
      consoleProblems,
    });

    await page.close();
  }
} finally {
  await browser.close();
}

const failed = results.flatMap((result) =>
  Object.entries(result.checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${result.viewport.name}:${name}`),
);

await writeFile(path.join(outDir, "summary.json"), `${JSON.stringify(results, null, 2)}\n`);

for (const result of results) {
  const passed = Object.values(result.checks).every(Boolean) ? "PASS" : "FAIL";
  const metrics = result.metrics;
  console.log(
    `${passed} ${result.viewport.name} ${result.viewport.width}x${result.viewport.height} ` +
      `bright=${metrics.brightPixels} nonDark=${metrics.nonDarkRatio.toFixed(4)} ` +
      `spread=${metrics.colorSpread.toFixed(1)} buckets=${metrics.colorBuckets}` +
      (result.motion ? ` motion=${result.motion.changedRatio.toFixed(4)}` : ""),
  );
}

if (failed.length > 0) {
  console.error(`Verification failed: ${failed.join(", ")}`);
  process.exitCode = 1;
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Could not find Chrome or Edge for Playwright verification.");
  }

  return found;
}

function analyzePng(buffer) {
  const png = decodePng(buffer);
  const stride = png.width * 4;
  const step = Math.max(1, Math.floor(Math.sqrt((png.width * png.height) / 180_000)));
  const buckets = new Set();

  let samples = 0;
  let brightPixels = 0;
  let nonDarkPixels = 0;
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;

  for (let y = 0; y < png.height; y += step) {
    for (let x = 0; x < png.width; x += step) {
      const offset = y * stride + x * 4;
      const r = png.pixels[offset];
      const g = png.pixels[offset + 1];
      const b = png.pixels[offset + 2];
      const brightness = Math.max(r, g, b);

      samples += 1;
      if (brightness > 42) brightPixels += 1;
      if (brightness > 14) nonDarkPixels += 1;

      minR = Math.min(minR, r);
      minG = Math.min(minG, g);
      minB = Math.min(minB, b);
      maxR = Math.max(maxR, r);
      maxG = Math.max(maxG, g);
      maxB = Math.max(maxB, b);
      buckets.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    }
  }

  return {
    width: png.width,
    height: png.height,
    samples,
    brightPixels,
    nonDarkRatio: nonDarkPixels / samples,
    colorSpread: maxR - minR + (maxG - minG) + (maxB - minB),
    colorBuckets: buckets.size,
  };
}

function comparePng(firstBuffer, secondBuffer) {
  const first = decodePng(firstBuffer);
  const second = decodePng(secondBuffer);
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error("Cannot compare PNGs with different dimensions.");
  }

  const step = Math.max(1, Math.floor(Math.sqrt((first.width * first.height) / 180_000)));
  let samples = 0;
  let changed = 0;
  let totalDelta = 0;

  for (let y = 0; y < first.height; y += step) {
    for (let x = 0; x < first.width; x += step) {
      const offset = (y * first.width + x) * 4;
      const delta =
        Math.abs(first.pixels[offset] - second.pixels[offset]) +
        Math.abs(first.pixels[offset + 1] - second.pixels[offset + 1]) +
        Math.abs(first.pixels[offset + 2] - second.pixels[offset + 2]);

      samples += 1;
      totalDelta += delta;
      if (delta > 18) {
        changed += 1;
      }
    }
  }

  return {
    changedRatio: changed / samples,
    averageDelta: totalDelta / samples,
  };
}

function decodePng(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("Screenshot is not a PNG.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = channels;
  const rowLength = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + rowLength));
    sourceOffset += rowLength;
    unfilterRow(row, previous, bytesPerPixel, filter);

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return { width, height, pixels };
}

function unfilterRow(row, previous, bytesPerPixel, filter) {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
    const up = previous[i] || 0;
    const upperLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] || 0 : 0;

    if (filter === 1) {
      row[i] = (row[i] + left) & 0xff;
    } else if (filter === 2) {
      row[i] = (row[i] + up) & 0xff;
    } else if (filter === 3) {
      row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[i] = (row[i] + paeth(left, up, upperLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter: ${filter}`);
    }
  }
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}
