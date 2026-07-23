import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { BomExporter } from '../../src/bom/bomExporter';
import type { BomEntry } from '../../src/types';

const addRow = jest.fn();
const getRow = jest.fn(() => ({ font: {} }));
const writeFile = jest.fn(async () => undefined);
const addWorksheet = jest.fn(() => ({
  columns: [],
  addRow,
  getRow
}));

jest.mock('exceljs/lib/doc/workbook.js', () =>
  jest.fn().mockImplementation(() => ({
    addWorksheet,
    xlsx: { writeFile }
  }))
);

const ENTRY: BomEntry = {
  references: ['R1', 'R2'],
  quantity: 2,
  value: '10k',
  footprint: 'Resistor_SMD:R_0603_1608Metric',
  mpn: 'RC0603FR-0710KL',
  manufacturer: 'Yageo',
  lcsc: 'C25804',
  description: 'Thick-film resistor',
  dnp: false
};

describe('BomExporter', () => {
  let tempDirectory: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'bom-exporter-'));
  });

  afterEach(async () => {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  });

  it('builds the XLSX workbook through the lazy Workbook constructor', async () => {
    const outputFile = path.join(tempDirectory, 'bom.xlsx');
    const exporter = new BomExporter();

    await expect(exporter.exportXlsx([ENTRY], outputFile)).resolves.toBe(
      outputFile
    );

    expect(addWorksheet).toHaveBeenCalledWith('BOM');
    expect(addRow).toHaveBeenCalledWith({
      reference: 'R1 R2',
      quantity: 2,
      value: '10k',
      footprint: 'Resistor_SMD:R_0603_1608Metric',
      mpn: 'RC0603FR-0710KL',
      manufacturer: 'Yageo',
      lcsc: 'C25804',
      description: 'Thick-film resistor',
      dnp: false
    });
    expect(getRow).toHaveBeenCalledWith(1);
    expect(writeFile).toHaveBeenCalledWith(outputFile);
  });
});
