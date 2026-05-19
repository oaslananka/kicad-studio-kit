export const KICAD_MCP_PROFILES = [
  { id: 'full', label: 'Full', blurb: 'All tools (heaviest)' },
  { id: 'minimal', label: 'Minimal', blurb: 'Read + export only' },
  {
    id: 'schematic_only',
    label: 'Schematic Only',
    blurb: 'Schematic capture and inspection'
  },
  { id: 'pcb_only', label: 'PCB Only', blurb: 'Board layout and inspection' },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    blurb: 'Gated release export only'
  },
  { id: 'high_speed', label: 'High-Speed', blurb: 'SI / impedance / tuning' },
  { id: 'power', label: 'Power', blurb: 'PDN, thermal, planes' },
  { id: 'simulation', label: 'Simulation', blurb: 'SPICE OP / AC / TRAN / DC' },
  { id: 'analysis', label: 'Analysis', blurb: 'Validation gates and reviews' },
  {
    id: 'agent_full',
    label: 'Agent (Full)',
    blurb: 'Agent-oriented full surface'
  }
] as const;

export type KicadMcpProfileId = (typeof KICAD_MCP_PROFILES)[number]['id'];

export function isKicadMcpProfile(value: string): value is KicadMcpProfileId {
  return KICAD_MCP_PROFILES.some((profile) => profile.id === value);
}
