export function pcbLayers(
  count: number
): Array<{ name: string; kind: string; visible: boolean }> {
  const names = [
    'F.Cu',
    'B.Cu',
    'Edge.Cuts',
    'F.SilkS',
    'B.SilkS',
    'Dwgs.User'
  ];
  return Array.from({ length: count }, (_, index) => ({
    name: names[index] ?? `User.${index + 1}`,
    kind: index < 2 ? 'signal' : 'user',
    visible: index < 10
  }));
}

export function tuningProfiles(): Array<{
  name: string;
  layer: string;
  impedance: string;
}> {
  return [
    { name: 'USB differential pair', layer: 'F.Cu', impedance: '90 ohm' },
    { name: 'RF feed', layer: 'B.Cu', impedance: '50 ohm' }
  ];
}

export function bomRows(): Array<Record<string, unknown>> {
  return [
    component('U1', 'MCU', 'QFN-48', 'STM32G4', 'ST', 'C529909', 'Controller'),
    component(
      'R1 R2 R3',
      '10k',
      '0603',
      'RC0603FR-0710KL',
      'Yageo',
      'C25804',
      'Pull-up'
    ),
    component(
      'C1 C2',
      '100nF',
      '0603',
      'CL10B104KB8NNNC',
      'Samsung',
      'C1591',
      'Decoupling'
    )
  ];
}

export function schematicSvg(kind: 'clean' | 'large'): string {
  const extra = kind === 'large' ? schematicWires(12) : schematicWires(4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1200" viewBox="0 0 2000 1200">
    <rect width="2000" height="1200" fill="#ffffff"/>
    <path d="M120 120 H1880 V1080 H120 Z" fill="none" stroke="#2563eb" stroke-width="18"/>
    ${extra}
  </svg>`;
}

export function createValidationHtml(
  id: 'drc-errors' | 'erc-errors',
  theme: string
): string {
  const label = id === 'drc-errors' ? 'DRC' : 'ERC';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px/1.5 var(--vscode-font-family)}
    .validation-shell{display:grid;grid-template-rows:auto 1fr;height:100vh;border-left:1px solid var(--vscode-panel-border)}
    header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-editorWidget-border)}
    header strong{flex:1}.badge{border:1px solid var(--vscode-inputValidation-errorBorder,var(--vscode-panel-border));padding:2px 7px;border-radius:999px}
    button{border:1px solid var(--vscode-button-secondaryBorder,var(--vscode-panel-border));background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:4px;padding:4px 8px}
    [role="tree"]{overflow:auto;padding:8px}.validation-row{display:grid;grid-template-columns:18px 1fr auto;gap:8px;align-items:center;padding:7px 8px;border-bottom:1px solid var(--vscode-panel-border)}
    .validation-row.error{color:var(--vscode-errorForeground,var(--vscode-foreground))}.validation-row.warning{color:var(--vscode-editorWarning-foreground,var(--vscode-foreground))}
    .muted{color:var(--vscode-descriptionForeground)}
  </style></head><body><section class="validation-shell" aria-label="${label} validation ${theme}">
    <header><strong>${label} results</strong><span class="badge">2 errors, 1 warning</span><button>Run ${label}</button></header>
    <div role="tree">
      <div class="validation-row error" role="treeitem"><span>!</span><span>${label} clearance violation on net /VBUS</span><span class="muted">J1:1</span></div>
      <div class="validation-row error" role="treeitem"><span>!</span><span>${label} unconnected critical pin</span><span class="muted">U1:4</span></div>
      <div class="validation-row warning" role="treeitem"><span>!</span><span>${label} warning near mounting hole</span><span class="muted">H2</span></div>
      <div class="validation-row" role="treeitem"><span>i</span><span>Last run from KiCad 10.0.3 fixture</span><span class="muted">fresh</span></div>
    </div></section></body></html>`;
}

function component(
  references: string,
  value: string,
  footprint: string,
  mpn: string,
  manufacturer: string,
  lcsc: string,
  description: string
): Record<string, unknown> {
  return {
    references: references.split(' '),
    quantity: references.split(' ').length,
    value,
    footprint,
    mpn,
    manufacturer,
    lcsc,
    description,
    dnp: false
  };
}

function schematicWires(count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const y = 180 + index * 72;
    return `<g fill="none" stroke="#111827" stroke-width="8">
      <path d="M220 ${y} H820 V${y + 36} H1520"/>
      <rect x="880" y="${y - 28}" width="240" height="90" rx="10"/>
      <text x="910" y="${y + 24}" fill="#111827" font-size="38">U${index + 1}</text>
    </g>`;
  }).join('');
}
