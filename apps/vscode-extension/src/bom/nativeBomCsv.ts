import type { BomEntry } from './bomTypes';

const HEADERS = [
  'Reference',
  'Value',
  'Footprint',
  'Quantity',
  'DNP',
  'MPN',
  'Manufacturer',
  'LCSC',
  'Description'
] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += char;
      }
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      afterQuote = false;
      if (char !== ',') {
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else if (char === '"' && cell === '' && !afterQuote) {
      quoted = true;
    } else if (afterQuote || char === '"') {
      throw new Error('KiCad BOM has malformed CSV quoting.');
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('KiCad BOM has an unterminated CSV field.');
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Validate native KiCad BOM data before it reaches user-facing CSV/XLSX. */
export function parseNativeKiCadBomCsv(
  text: string,
  groupIdentical: boolean
): BomEntry[] {
  const rows = parseCsv(text);
  if (
    rows.length === 0 ||
    rows[0]?.length !== HEADERS.length ||
    !HEADERS.every((header, index) => rows[0]?.[index] === header)
  ) {
    throw new Error('KiCad BOM schema is unsupported.');
  }

  const entries: BomEntry[] = rows.slice(1).map((row) => {
    if (row.length !== HEADERS.length) {
      throw new Error('KiCad BOM contains an incomplete row.');
    }
    const [
      refs = '',
      value = '',
      footprint = '',
      rawQuantity = '',
      dnp = '',
      mpn = '',
      manufacturer = '',
      lcsc = '',
      description = ''
    ] = row;
    const references = refs.split(/[\s,]+/).filter(Boolean);
    const quantity = Number(rawQuantity);
    if (
      !references.length ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      references.length !== quantity ||
      !['', 'yes', 'no', 'dnp'].includes(dnp.toLowerCase())
    ) {
      throw new Error('KiCad BOM contains invalid component metadata.');
    }
    return {
      references,
      quantity,
      value,
      footprint,
      mpn,
      manufacturer,
      lcsc,
      description,
      dnp: ['yes', 'dnp'].includes(dnp.toLowerCase())
    };
  });

  if (!groupIdentical) return entries;
  const groups = new Map<string, BomEntry>();
  for (const entry of entries) {
    const key = JSON.stringify([
      entry.value,
      entry.footprint,
      entry.mpn,
      entry.manufacturer,
      entry.description,
      entry.lcsc,
      entry.dnp
    ]);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...entry, references: [...entry.references] });
    } else {
      existing.references.push(...entry.references);
      existing.quantity += entry.quantity;
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.references.join(',').localeCompare(right.references.join(','))
  );
}
