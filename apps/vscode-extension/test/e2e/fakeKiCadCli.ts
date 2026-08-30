import * as fs from 'node:fs';
import * as path from 'node:path';

const FAKE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="#ffffff"/></svg>';

export interface FakeKiCadCliFixture {
  configuredPath: string;
  executablePath: string;
  args: string[];
}

export function installFakeKiCadCli(rootDir: string): FakeKiCadCliFixture {
  const binDir = path.join(rootDir, '.test-bin');
  const scriptPath = path.join(binDir, 'kicad-cli.cjs');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    scriptPath,
    `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('KiCad CLI 9.0.0');
  process.exit(0);
}
const outputIndex = args.indexOf('--output');
const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
if (args[0] === 'pcb' && args[1] === 'export' && args[2] === 'svg' && output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, ${JSON.stringify(FAKE_SVG)}, 'utf8');
  process.exit(0);
}
console.error('Unsupported fake kicad-cli invocation: ' + args.join(' '));
process.exit(2);
`,
    'utf8'
  );
  return {
    configuredPath: `${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)}`,
    executablePath: process.execPath,
    args: [scriptPath]
  };
}
