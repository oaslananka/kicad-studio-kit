export const KICAD_MCP_PRIMARY_PROFILES = [
  {
    id: 'review',
    label: 'Review',
    blurb: 'Least-privilege design review and validation'
  },
  {
    id: 'build',
    label: 'Build',
    blurb: 'Design-authoring workflow; writes still require write mode'
  },
  {
    id: 'release',
    label: 'Release',
    blurb: 'Manufacturing validation and gated release export'
  },
  {
    id: 'expert',
    label: 'Expert',
    blurb: 'Full tool surface; operating mode still gates risky actions'
  }
] as const;

export const KICAD_MCP_ADVANCED_PROFILES = [
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
  { id: 'analysis', label: 'Analysis', blurb: 'Validation gates and reviews' }
] as const;

export const KICAD_MCP_PROFILES = [
  ...KICAD_MCP_PRIMARY_PROFILES,
  ...KICAD_MCP_ADVANCED_PROFILES
] as const;

export type KicadMcpProfileId = (typeof KICAD_MCP_PROFILES)[number]['id'];

export function isKicadMcpProfile(value: string): value is KicadMcpProfileId {
  return KICAD_MCP_PROFILES.some((profile) => profile.id === value);
}

export function resolveKicadMcpProfile(
  value: string | undefined
): KicadMcpProfileId {
  if (value === 'default') {
    return 'review';
  }
  if (value === 'full' || value === 'agent_full') {
    return 'expert';
  }
  return value && isKicadMcpProfile(value) ? value : 'review';
}
