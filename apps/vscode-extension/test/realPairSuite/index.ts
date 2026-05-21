import * as path from 'node:path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 180000
  });

  mocha.addFile(
    path.resolve(
      __dirname,
      '..',
      'integration',
      'realServer',
      'extensionHost.flow.test.js'
    )
  );

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} real-pair host tests failed.`));
      } else {
        resolve();
      }
    });
  });
}
