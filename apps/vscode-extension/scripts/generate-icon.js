#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function hasOpaqueNeighbor(alphaMap, width, height, x, y, radius) {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      if (alphaMap[ny * width + nx] > 24) {
        return true;
      }
    }
  }
  return false;
}

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return { h: hue / 6, s: saturation, l: lightness };
}

function hueToRgb(p, q, t) {
  let value = t;
  if (value < 0) {
    value += 1;
  }
  if (value > 1) {
    value -= 1;
  }
  if (value < 1 / 6) {
    return p + (q - p) * 6 * value;
  }
  if (value < 1 / 2) {
    return q;
  }
  if (value < 2 / 3) {
    return p + (q - p) * (2 / 3 - value) * 6;
  }
  return p;
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: clamp(Math.round(hueToRgb(p, q, h + 1 / 3) * 255)),
    g: clamp(Math.round(hueToRgb(p, q, h) * 255)),
    b: clamp(Math.round(hueToRgb(p, q, h - 1 / 3) * 255))
  };
}

function transformPixel(r, g, b, mode) {
  const hsl = rgbToHsl(r, g, b);

  if (mode === 'dark') {
    const nextLightness =
      hsl.l < 0.4 ? 0.58 + hsl.l * 0.18 : Math.min(0.82, hsl.l + 0.1);
    const nextSaturation = Math.min(1, hsl.s * 1.08 + 0.03);
    return hslToRgb(hsl.h, nextSaturation, nextLightness);
  }

  const nextLightness =
    hsl.l > 0.56 ? Math.max(0.3, hsl.l * 0.72) : Math.max(0.18, hsl.l * 0.9);
  const nextSaturation = Math.min(1, hsl.s * 1.04 + 0.02);
  return hslToRgb(hsl.h, nextSaturation, nextLightness);
}

function createVariantFromBase(basePng, mode) {
  const width = basePng.width;
  const height = basePng.height;
  const result = new PNG({ width, height });
  const alphaMap = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      alphaMap[y * width + x] = basePng.data[index + 3];
    }
  }

  const outline =
    mode === 'dark'
      ? { r: 244, g: 250, b: 255, a: 110 }
      : { r: 15, g: 23, b: 42, a: 110 };
  const halo =
    mode === 'dark'
      ? { r: 56, g: 189, b: 248, a: 34 }
      : { r: 15, g: 23, b: 42, a: 28 };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const alpha = alphaMap[y * width + x];

      if (alpha > 0) {
        const transformed = transformPixel(
          basePng.data[index],
          basePng.data[index + 1],
          basePng.data[index + 2],
          mode
        );
        result.data[index] = transformed.r;
        result.data[index + 1] = transformed.g;
        result.data[index + 2] = transformed.b;
        result.data[index + 3] = alpha;
        continue;
      }

      if (hasOpaqueNeighbor(alphaMap, width, height, x, y, 1)) {
        result.data[index] = outline.r;
        result.data[index + 1] = outline.g;
        result.data[index + 2] = outline.b;
        result.data[index + 3] = outline.a;
        continue;
      }

      if (hasOpaqueNeighbor(alphaMap, width, height, x, y, 2)) {
        result.data[index] = halo.r;
        result.data[index + 1] = halo.g;
        result.data[index + 2] = halo.b;
        result.data[index + 3] = halo.a;
      }
    }
  }

  return result;
}

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const baseIconPath = path.join(assetsDir, 'icon.png');

if (!fs.existsSync(baseIconPath)) {
  throw new Error(
    'Missing assets/icon.png. Provide your source icon manually; this script will only generate icon-dark.png and icon-light.png from that file.'
  );
}

const baseIcon = PNG.sync.read(fs.readFileSync(baseIconPath));
const darkVariant = createVariantFromBase(baseIcon, 'dark');
const lightVariant = createVariantFromBase(baseIcon, 'light');

fs.writeFileSync(
  path.join(assetsDir, 'icon-dark.png'),
  PNG.sync.write(darkVariant)
);
fs.writeFileSync(
  path.join(assetsDir, 'icon-light.png'),
  PNG.sync.write(lightVariant)
);
