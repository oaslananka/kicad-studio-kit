import * as path from 'node:path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000
  });

  mocha.addFile(
    path.resolve(__dirname, '..', 'integration', 'canaryCompatibility.test.js')
  );

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} VS Code canary smoke tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
