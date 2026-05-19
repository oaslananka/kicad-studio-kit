const fs = require('node:fs');
const path = require('node:path');

const packagePath = path.join(__dirname, '..', 'package.json');
const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const supported = manifest.capabilities?.untrustedWorkspaces?.supported;

if (supported !== 'limited') {
  console.error(
    'package.json must declare capabilities.untrustedWorkspaces.supported = "limited".'
  );
  process.exit(1);
}

console.log('Workspace trust capability is declared as limited.');
