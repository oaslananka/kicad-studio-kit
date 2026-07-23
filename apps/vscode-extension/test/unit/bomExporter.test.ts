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

  it('builds XLSX workbooks through the memoized lazy constructor', async () => {
    const firstOutputFile = path.join(tempDirectory, 'bom.xlsx');
    const secondOutputFile = path.join(tempDirectory, 'bom-copy.xlsx');
    const exporter = new BomExporter();

    await expect(exporter.exportXlsx([ENTRY], firstOutputFile)).resolves.toBe(
      firstOutputFile
    );
    await expect(exporter.exportXlsx([ENTRY], secondOutputFile)).resolves.toBe(
      secondOutputFile
    );

    expect(addWorksheet).toHaveBeenCalledTimes(2);
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
    expect(getRow).toHaveBeenCalledTimes(2);
    expect(getRow).toHaveBeenCalledWith(1);
    expect(writeFile).toHaveBeenNthCalledWith(1, firstOutputFile);
    expect(writeFile).toHaveBeenNthCalledWith(2, secondOutputFile);
  });
});
