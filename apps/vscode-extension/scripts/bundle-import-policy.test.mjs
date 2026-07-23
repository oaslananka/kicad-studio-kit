import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const exporterSource = fs.readFileSync(
  path.join(extensionRoot, 'src', 'bom', 'bomExporter.ts'),
  'utf8'
);

test('#531 XLSX export keeps the narrow ExcelJS Workbook entry lazy', () => {
  assert.match(exporterSource, /webpackChunkName:\s*["']exceljs["']/u);
  assert.match(exporterSource, /exceljs\/lib\/doc\/workbook\.js/u);
  const runtimeSource = exporterSource.replace(
    /typeof\s+import\(["']exceljs["']\)/gu,
    ''
  );
  assert.doesNotMatch(
    runtimeSource,
    /import\(\s*(?:\/\*[\s\S]*?\*\/\s*)?["']exceljs["']\s*\)/u
  );
});

test('#531 the narrow Workbook entry writes and reopens XLSX files', async () => {
  const { default: Workbook } = await import('exceljs/lib/doc/workbook.js');
  const tempDirectory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), 'exceljs-workbook-')
  );
  const outputFile = path.join(tempDirectory, 'contract.xlsx');

  try {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('BOM');
    sheet.columns = [
      { header: 'Reference', key: 'reference' },
      { header: 'Quantity', key: 'quantity' }
    ];
    sheet.addRow({ reference: 'R1 R2', quantity: 2 });
    await workbook.xlsx.writeFile(outputFile);

    const reopened = new Workbook();
    await reopened.xlsx.readFile(outputFile);
    const reopenedSheet = reopened.getWorksheet('BOM');
    assert.equal(reopenedSheet?.getCell('A2').value, 'R1 R2');
    assert.equal(reopenedSheet?.getCell('B2').value, 2);
  } finally {
    await fsPromises.rm(tempDirectory, { recursive: true, force: true });
  }
});
