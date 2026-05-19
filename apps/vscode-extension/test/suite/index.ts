import * as fs from 'node:fs';
import * as path from 'node:path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000
  });

  const testsRoot = path.resolve(__dirname, '..', 'integration');
  for (const file of fs.readdirSync(testsRoot)) {
    if (file.endsWith('.test.js')) {
      mocha.addFile(path.join(testsRoot, file));
    }
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} integration tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
