#!/usr/bin/env node

console.error(
  'Direct publish commands are disabled for KiCad Studio. Use the guarded Release workflow so release-please controls version, tag, assets, and publish gates.'
);
console.error(
  'This prevents accidental VS Marketplace, Open VSX, npm, Docker, or production GitHub Release publishing from local scripts.'
);
process.exit(1);
