const fs = require('node:fs');
const path = require('node:path');

const packagePath = path.join(__dirname, '..', 'package.json');
const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const untrustedWorkspaces = manifest.capabilities?.untrustedWorkspaces;
const supported = untrustedWorkspaces?.supported;
const restrictedConfigurations =
  untrustedWorkspaces?.restrictedConfigurations ?? [];
const requiredRestrictedConfigurations = [
  'kicadstudio.kicadCliPath',
  'kicadstudio.kicadPath',
  'kicadstudio.defaultOutputDir',
  'kicadstudio.cli.defineVars',
  'kicadstudio.ai.localEndpoint',
  'kicadstudio.ai.allowTools',
  'kicadstudio.mcp.endpoint',
  'kicadstudio.mcp.allowRemoteEndpoint',
  'kicadstudio.mcp.allowLegacySse',
  'kicadstudio.mcp.pushContext',
  'kicadstudio.pcm.repositoryUrls',
  'kicadstudio.pcm.configDir',
  'kicadstudio.pcm.thirdPartyDir'
];

if (supported !== 'limited') {
  console.error(
    'package.json must declare capabilities.untrustedWorkspaces.supported = "limited".'
  );
  process.exit(1);
}

const missing = requiredRestrictedConfigurations.filter(
  (setting) => !restrictedConfigurations.includes(setting)
);
if (missing.length) {
  console.error(
    `package.json must list trust-sensitive settings in capabilities.untrustedWorkspaces.restrictedConfigurations: ${missing.join(', ')}`
  );
  process.exit(1);
}

console.log(
  'Workspace trust capability is declared as limited with restricted trust-sensitive settings.'
);
