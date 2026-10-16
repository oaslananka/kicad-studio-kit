import * as path from 'node:path';
import codspeedPlugin from '@codspeed/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [codspeedPlugin()],
  resolve: {
    alias: {
      vscode: path.resolve(import.meta.dirname, 'bench/vscodeStub.ts')
    }
  },
  test: {
    include: ['bench/**/*.bench.ts'],
    benchmark: {
      include: ['bench/**/*.bench.ts']
    }
  }
});
