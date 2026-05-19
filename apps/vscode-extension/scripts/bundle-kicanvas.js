#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'media', 'kicanvas');
const outputFile = path.join(outputDir, 'kicanvas.js');
const noticeFile = path.join(outputDir, 'NOTICE.txt');
const minimumBundleBytes = 50 * 1024;

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(outputFile)) {
  throw new Error(
    'Missing committed KiCanvas bundle at media/kicanvas/kicanvas.js.'
  );
}

const stat = fs.statSync(outputFile);
if (stat.size < minimumBundleBytes) {
  throw new Error(`KiCanvas bundle is unexpectedly small: ${stat.size} bytes.`);
}

if (!fs.existsSync(noticeFile)) {
  throw new Error('Missing KiCanvas NOTICE file.');
}
