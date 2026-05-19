const fs = require('node:fs');
const path = require('node:path');

const BASELINE_PATH = path.join(__dirname, 'bundle-size-baseline.json');
const HARD_MAX_BYTES = 5 * 1024 * 1024;

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`Missing bundle size baseline: ${BASELINE_PATH}`);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
const artifacts = baseline.artifacts ?? {};
const currentArtifacts = collectCurrentArtifacts();

let failed = false;
for (const [name, baselineBytes] of Object.entries(artifacts)) {
  const currentBytes = currentArtifacts[name];
  if (typeof baselineBytes !== 'number') {
    console.error(`Invalid baseline entry for ${name}.`);
    failed = true;
    continue;
  }
  if (typeof currentBytes !== 'number') {
    console.error(`Missing bundle artifact for ${name}.`);
    failed = true;
    continue;
  }

  console.log(
    `${name}: ${formatBytes(currentBytes)} / baseline reference ${formatBytes(
      baselineBytes
    )} / hard max ${formatBytes(HARD_MAX_BYTES)}`
  );
  if (currentBytes > HARD_MAX_BYTES) {
    console.error(
      `Bundle size limit exceeded: ${name} is ${formatBytes(
        currentBytes
      )}, above the hard 5 MB limit. Split or externalize assets before release.`
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

function collectCurrentArtifacts() {
  const result = {
    'dist/extension.js': statIfExists(
      path.join(process.cwd(), 'dist', 'extension.js')
    ),
    'dist/exceljs.js': statIfExists(
      path.join(process.cwd(), 'dist', 'exceljs.js')
    ),
    'media/kicanvas/kicanvas.js': statIfExists(
      path.join(process.cwd(), 'media', 'kicanvas', 'kicanvas.js')
    ),
    vsix: findLatestVsixSize(process.cwd())
  };

  return result;
}

function statIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : undefined;
}

function findLatestVsixSize(root) {
  const vsixFiles = fs
    .readdirSync(root)
    .filter((entry) => entry.endsWith('.vsix'))
    .map((entry) => ({
      path: path.join(root, entry),
      stat: fs.statSync(path.join(root, entry))
    }))
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  const [latest] = vsixFiles;
  return latest?.stat.size;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
