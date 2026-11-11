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

interface CsvState {
  rows: string[][];
  row: string[];
  cell: string;
  quoted: boolean;
  afterQuote: boolean;
}

function readQuotedCharacter(
  state: CsvState,
  input: string,
  index: number
): number {
  if (input[index] !== '"') {
    state.cell += input[index];
    return index;
  }
  if (input[index + 1] === '"') {
    state.cell += '"';
    return index + 1;
  }
  state.quoted = false;
  state.afterQuote = true;
  return index;
}

function consumeDelimiter(
  state: CsvState,
  input: string,
  index: number
): number {
  const char = input[index];
  state.row.push(state.cell);
  state.cell = '';
  state.afterQuote = false;
  if (char === ',') return index;

  if (state.row.length > 1 || state.row[0] !== '') {
    state.rows.push(state.row);
  }
  state.row = [];
  return char === '\r' && input[index + 1] === '\n' ? index + 1 : index;
}

function readUnquotedCharacter(
  state: CsvState,
  input: string,
  index: number
): number {
  const char = input[index];
  if (char === ',' || char === '\n' || char === '\r') {
    return consumeDelimiter(state, input, index);
  }
  if (char === '"') {
    if (state.cell === '' && !state.afterQuote) {
      state.quoted = true;
      return index;
    }
    throw new Error('KiCad BOM has malformed CSV quoting.');
  }
  if (state.afterQuote) {
    throw new Error('KiCad BOM has malformed CSV quoting.');
  }
  state.cell += char;
  return index;
}

function parseCsv(text: string): string[][] {
  const state: CsvState = {
    rows: [],
    row: [],
    cell: '',
    quoted: false,
    afterQuote: false
  };
  const input = text.replace(/^\uFEFF/, '');
  let index = 0;
  while (index < input.length) {
    const consumedIndex = state.quoted
      ? readQuotedCharacter(state, input, index)
      : readUnquotedCharacter(state, input, index);
    index = consumedIndex + 1;
  }
  if (state.quoted) throw new Error('KiCad BOM has an unterminated CSV field.');
  if (state.cell !== '' || state.row.length) {
    state.row.push(state.cell);
    state.rows.push(state.row);
  }
  return state.rows;
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
