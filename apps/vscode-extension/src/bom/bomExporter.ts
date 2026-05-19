import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BomEntry } from '../types';

type ExcelJsModule = typeof import('exceljs');

let excelJsModulePromise: Promise<ExcelJsModule> | undefined;

async function loadExcelJs(): Promise<ExcelJsModule> {
  if (!excelJsModulePromise) {
    excelJsModulePromise = import(
      /* webpackChunkName: "exceljs" */
      'exceljs'
    );
  }
  return excelJsModulePromise;
}

export class BomExporter {
  async exportCsv(entries: BomEntry[], outputFile: string): Promise<string> {
    const header = [
      'Reference',
      'Quantity',
      'Value',
      'Footprint',
      'MPN',
      'Manufacturer',
      'LCSC',
      'Description',
      'DNP'
    ];
    const rows = [
      header.join(','),
      ...entries.map((entry) =>
        [
          entry.references.join(' '),
          entry.quantity,
          entry.value,
          entry.footprint,
          entry.mpn,
          entry.manufacturer,
          entry.lcsc,
          entry.description,
          entry.dnp ? 'yes' : 'no'
        ]
          .map(csvEscape)
          .join(',')
      )
    ];
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `\uFEFF${rows.join('\n')}`, 'utf8');
    return outputFile;
  }

  async exportJson(entries: BomEntry[], outputFile: string): Promise<string> {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, JSON.stringify(entries, null, 2), 'utf8');
    return outputFile;
  }

  async exportXlsx(entries: BomEntry[], outputFile: string): Promise<string> {
    const ExcelJS = await loadExcelJs();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BOM');

    sheet.columns = [
      { header: 'Reference', key: 'reference' },
      { header: 'Quantity', key: 'quantity' },
      { header: 'Value', key: 'value' },
      { header: 'Footprint', key: 'footprint' },
      { header: 'MPN', key: 'mpn' },
      { header: 'Manufacturer', key: 'manufacturer' },
      { header: 'LCSC', key: 'lcsc' },
      { header: 'Description', key: 'description' },
      { header: 'DNP', key: 'dnp' }
    ];

    for (const entry of entries) {
      sheet.addRow({
        reference: entry.references.join(' '),
        quantity: entry.quantity,
        value: entry.value,
        footprint: entry.footprint,
        mpn: entry.mpn,
        manufacturer: entry.manufacturer,
        lcsc: entry.lcsc,
        description: entry.description,
        dnp: entry.dnp
      });
    }

    sheet.getRow(1).font = { bold: true };
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await workbook.xlsx.writeFile(outputFile);
    return outputFile;
  }

  async exportInteractiveHtml(
    entries: BomEntry[],
    outputFile: string
  ): Promise<string> {
    const rows = entries
      .map(
        (
          entry
        ) => `<tr data-reference="${escapeHtml(entry.references[0] ?? '')}">
  <td>${escapeHtml(entry.references.join(', '))}</td>
  <td>${entry.quantity}</td>
  <td>${escapeHtml(entry.value)}</td>
  <td>${escapeHtml(entry.footprint)}</td>
  <td>${escapeHtml(entry.mpn)}</td>
  <td>${escapeHtml(entry.manufacturer)}</td>
  <td>${escapeHtml(entry.lcsc)}</td>
  <td>${escapeHtml(entry.description)}</td>
</tr>`
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive BOM</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    input { width: 100%; margin-bottom: 16px; padding: 10px 12px; border-radius: 10px; border: 1px solid #334155; background: #111827; color: inherit; }
    table { width: 100%; border-collapse: collapse; background: #111827; border-radius: 12px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #1f2937; text-align: left; }
    th { background: #1e293b; position: sticky; top: 0; }
    tr.hidden { display: none; }
  </style>
</head>
<body>
  <h1>KiCad Studio Interactive BOM</h1>
  <input id="filter" aria-label="Filter BOM rows" placeholder="Filter by reference, value, footprint, or MPN">
  <table>
    <thead>
      <tr><th>Reference</th><th>Qty</th><th>Value</th><th>Footprint</th><th>MPN</th><th>Manufacturer</th><th>LCSC</th><th>Description</th></tr>
    </thead>
    <tbody id="rows">${rows}</tbody>
  </table>
  <script>
    const filter = document.getElementById('filter');
    const rows = [...document.querySelectorAll('#rows tr')];
    filter.addEventListener('input', () => {
      const query = filter.value.toLowerCase();
      for (const row of rows) {
        row.classList.toggle('hidden', !row.textContent.toLowerCase().includes(query));
      }
    });
  </script>
</body>
</html>`;

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, html, 'utf8');
    return outputFile;
  }
}

function csvEscape(value: string | number | boolean): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
