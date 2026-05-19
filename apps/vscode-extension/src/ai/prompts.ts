export type AiLanguage =
  | 'en'
  | 'tr'
  | 'de'
  | 'zh-CN'
  | 'ja'
  | 'fr'
  | 'es'
  | 'ko'
  | 'pt-BR';

export interface KiCadContext {
  boardLayers?: number | undefined;
  kicadVersion?: string | undefined;
  projectName?: string | undefined;
  activeVariant?: string | undefined;
  mcpConnected?: boolean | undefined;
}

export const DEFAULT_AI_LANGUAGE: AiLanguage = 'en';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_OPENAI_API_MODE = 'responses';

const LANGUAGE_NAMES: Record<AiLanguage, string> = {
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  'zh-CN': 'Simplified Chinese',
  ja: 'Japanese',
  fr: 'French',
  es: 'Spanish',
  ko: 'Korean',
  'pt-BR': 'Brazilian Portuguese'
};

/**
 * Normalize a user-configured language code into a supported AI response language.
 */
export function normalizeAiLanguage(value: string | undefined): AiLanguage {
  if (
    value === 'tr' ||
    value === 'de' ||
    value === 'zh-CN' ||
    value === 'ja' ||
    value === 'fr' ||
    value === 'es' ||
    value === 'ko' ||
    value === 'pt-BR'
  ) {
    return value;
  }
  return DEFAULT_AI_LANGUAGE;
}

/**
 * Build the base system prompt used by the extension's AI providers.
 */
export function buildSystemPrompt(
  language: AiLanguage,
  context?: KiCadContext
): string {
  const parts = [
    'You are an expert electrical engineer specializing in KiCad PCB and schematic design.',
    'You understand KiCad S-expression file format, design rules, fabrication requirements, and component selection.',
    'You are familiar with KiCad 10 features including design variants, time-domain signal tuning, graphical DRC rules (.kicad_dru), design blocks, hop-over display, pin and gate swap, inner-layer footprint objects, and 3D PDF export.',
    'Be practical, step-by-step, and safety-aware.',
    'When context is incomplete, state your assumption clearly before proceeding.',
    'For DRC/ERC errors, always provide: (1) root cause, (2) step-by-step fix, (3) prevention tip.',
    'When recurring violations appear, recommend whether a graphical DRC rule or board setup change is more appropriate.',
    `Respond in ${LANGUAGE_NAMES[language]}.`
  ];
  if (context?.projectName) {
    parts.push(`Project name: ${context.projectName}.`);
  }
  if (context?.boardLayers) {
    parts.push(`Board has ${context.boardLayers} layers.`);
  }
  if (context?.kicadVersion) {
    parts.push(`KiCad version: ${context.kicadVersion}.`);
  }
  if (context?.activeVariant) {
    parts.push(`Active design variant: ${context.activeVariant}.`);
  }
  if (context?.mcpConnected) {
    parts.push(
      'An MCP integration is connected. If you suggest design changes, you may optionally include executable MCP tool calls inside a ```mcp JSON block.'
    );
  }
  return parts.join(' ');
}

export function buildCircuitExplanationPrompt(): string {
  return 'Explain what this selected KiCad circuit block does, how it works, and call out any likely design risks or review notes.';
}

export function buildErrorAnalysisPrompt(args: {
  message: string;
  ruleName?: string;
  boardInfo?: string;
}): string {
  return [
    'Explain this KiCad DRC/ERC issue and provide step-by-step fix guidance.',
    `Issue: ${args.message}`,
    `Rule: ${args.ruleName || 'unknown'}`,
    'Coordinates: unknown',
    `Board context: ${args.boardInfo || 'unknown board'}`
  ].join('\n');
}

export function buildComponentRecommendationPrompt(
  value: string,
  footprint: string,
  specs: string[]
): string {
  return [
    'Recommend practical alternative components for this KiCad part selection.',
    `Current value: ${value || 'unknown'}`,
    `Footprint: ${footprint || 'unknown'}`,
    `Required specs: ${specs.length ? specs.join(', ') : 'none provided'}`,
    'Return a concise shortlist with tradeoffs and sourcing notes.'
  ].join('\n');
}

export function buildProactiveDRCPrompt(
  errors: string[],
  boardInfo: string
): string {
  const grouped = groupErrorsByCategory(errors);
  return [
    'Summarize these KiCad DRC findings and prioritize them from critical to informational.',
    `Board info: ${boardInfo || 'unknown board'}`,
    'Grouped findings:',
    ...Object.entries(grouped).map(
      ([category, items]) =>
        `${category} (${items.length}): ${items
          .slice(0, 3)
          .map((item) => item.replace(/\s+/g, ' ').trim())
          .join('; ')}`
    ),
    'DRC errors:',
    ...errors.map((error, index) => `${index + 1}. ${error}`),
    'If KiCad 10 is available, mention whether the graphical DRC rule editor is appropriate for recurring or intentional constraints.',
    'For each priority bucket, explain the root cause, concrete fix steps, and one prevention tip.'
  ].join('\n');
}

export function buildNetAnalysisPrompt(
  netName: string,
  connections: string[]
): string {
  return [
    'Analyze this KiCad net and explain what it likely does electrically.',
    `Net name: ${netName}`,
    `Connections: ${connections.length ? connections.join(', ') : 'none provided'}`,
    'Highlight likely signal purpose, risk areas, and review questions.'
  ].join('\n');
}

function groupErrorsByCategory(errors: string[]): Record<string, string[]> {
  const groups: {
    clearance: string[];
    unconnected: string[];
    courtyard: string[];
    silkscreen: string[];
    mechanical: string[];
    other: string[];
  } = {
    clearance: [],
    unconnected: [],
    courtyard: [],
    silkscreen: [],
    mechanical: [],
    other: []
  };

  for (const error of errors) {
    const normalized = error.toLowerCase();
    if (normalized.includes('clearance') || normalized.includes('spacing')) {
      groups['clearance'].push(error);
    } else if (
      normalized.includes('unconnected') ||
      normalized.includes('not connected')
    ) {
      groups['unconnected'].push(error);
    } else if (normalized.includes('courtyard')) {
      groups['courtyard'].push(error);
    } else if (normalized.includes('silk')) {
      groups['silkscreen'].push(error);
    } else if (
      normalized.includes('edge') ||
      normalized.includes('board outline') ||
      normalized.includes('hole')
    ) {
      groups['mechanical'].push(error);
    } else {
      groups['other'].push(error);
    }
  }

  return Object.fromEntries(
    Object.entries(groups).filter(([, items]) => items.length > 0)
  );
}
