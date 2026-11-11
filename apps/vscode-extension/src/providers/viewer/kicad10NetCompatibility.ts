/**
 * Read-only KiCanvas compatibility adapter for KiCad 10's newer named-net
 * S-expression syntax. The actual board file is never changed.
 *
 * KiCad 10 (2026 board schema) serializes pad/track/via/zone references as
 * (net "name"), with no top-level numbered net table. The bundled KiCanvas
 * expects a numbered table and numbered references to highlight copper.
 */
export function normalizeKiCad10NamedNetsForRenderer(source: string): string {
  if (!/^\s*\(kicad_pcb\b/.test(source)) return source;
  // Preserve KiCad 6–9 and older KiCad 10 boards with numeric net tables.
  if (/\(net\s+\d+\s+"(?:\\.|[^"\\])*"\s*\)/.test(source)) return source;

  const namedRef = /\(net\s+"((?:\\.|[^"\\])*)"\s*\)/g;
  const ids = new Map<string, number>();
  const normalized = source.replace(namedRef, (match, name: string) => {
    if (!name) return match;
    let id = ids.get(name);
    if (id === undefined) {
      id = ids.size + 1;
      ids.set(name, id);
    }
    return '(net ' + id + ' "' + name + '")';
  });
  if (ids.size === 0) return source;

  // Match KiCad's original written/escaped names exactly, not a guessed
  // reference name or net generated from another copy of this document.
  const table = [...ids]
    .map(([name, id]) => '\n\t(net ' + id + ' "' + name + '")')
    .join('');
  // Insert at the root after the board opener. No nested/ambiguous paper
  // matching: a linear, anchored prefix avoids backtracking on large PCBs.
  return normalized.replace(/^\s*\(kicad_pcb\b/, (match) => match + table);
}
