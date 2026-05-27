import type { Page, TestInfo } from '@playwright/test';

export type VisualTheme = {
  id: string;
  label: string;
  viewerTheme: 'kicad' | 'light';
  fallbackBackground: string;
  media: Parameters<Page['emulateMedia']>[0];
  tokens: Record<string, string>;
};

export type VisualViewport = { id: string; width: number; height: number };
export type VisualCase = {
  id: string;
  theme: VisualTheme;
  viewport: VisualViewport;
};
export type VisualFixture = {
  id: string;
  prepare: (page: Page, theme: VisualTheme) => Promise<void>;
  verify?: (page: Page, viewport: VisualViewport) => Promise<void>;
};

export const VISUAL_MAX_DIFF_PIXEL_RATIO = 0.002;
export const VISUAL_PIXELMATCH_THRESHOLD = 0.2;
export const VISUAL_SETTLE_MS = 120;
export const HEADER_MAX_HEIGHT = 44;
export const FALLBACK_MIN_HEIGHT_RATIO = 0.72;
export const VIEWER_MIN_WIDTH_RATIO = 0.62;

const THEMES: readonly VisualTheme[] = [
  {
    id: 'vscode-dark',
    label: 'VS Code Dark',
    viewerTheme: 'kicad',
    fallbackBackground: '#050816',
    media: {
      colorScheme: 'dark',
      forcedColors: 'none',
      reducedMotion: 'reduce'
    },
    tokens: themeTokens({
      background: '#1e1e1e',
      panel: '#252526',
      border: '#3c3c3c',
      text: '#cccccc',
      muted: '#9d9d9d',
      focus: '#007fd4',
      button: '#0e639c',
      buttonText: '#ffffff',
      secondary: '#3a3d41',
      secondaryText: '#cccccc'
    })
  },
  {
    id: 'vscode-light',
    label: 'VS Code Light',
    viewerTheme: 'light',
    fallbackBackground: '#f8fafc',
    media: {
      colorScheme: 'light',
      forcedColors: 'none',
      reducedMotion: 'reduce'
    },
    tokens: themeTokens({
      background: '#ffffff',
      panel: '#f3f3f3',
      border: '#d4d4d4',
      text: '#1f1f1f',
      muted: '#616161',
      focus: '#0078d4',
      button: '#0078d4',
      buttonText: '#ffffff',
      secondary: '#e5e5e5',
      secondaryText: '#1f1f1f'
    })
  },
  {
    id: 'vscode-high-contrast',
    label: 'VS Code High Contrast',
    viewerTheme: 'kicad',
    fallbackBackground: '#000000',
    media: {
      colorScheme: 'dark',
      forcedColors: 'active',
      reducedMotion: 'reduce'
    },
    tokens: themeTokens({
      background: '#000000',
      panel: '#000000',
      border: '#ffffff',
      text: '#ffffff',
      muted: '#ffff00',
      focus: '#00ffff',
      button: '#000000',
      buttonText: '#ffffff',
      secondary: '#000000',
      secondaryText: '#ffffff'
    })
  }
];

const VIEWPORTS: readonly VisualViewport[] = [
  { id: '1280x720', width: 1280, height: 720 },
  { id: '1920x1080', width: 1920, height: 1080 },
  { id: '2560x1440', width: 2560, height: 1440 },
  { id: '3840x2160', width: 3840, height: 2160 }
];

export const VISUAL_CASES: readonly VisualCase[] = THEMES.flatMap((theme) =>
  VIEWPORTS.map((viewport) => ({
    id: `${theme.id}-${viewport.id}`,
    theme,
    viewport
  }))
);

export async function prepareVisualPage(
  page: Page,
  visualCase: VisualCase
): Promise<void> {
  await page.setViewportSize(visualCase.viewport);
  await page.emulateMedia(visualCase.theme.media);
}

export async function applyThemeTokens(
  page: Page,
  theme: VisualTheme
): Promise<void> {
  await page.evaluate(
    (tokens) => {
      const root = document.documentElement;
      for (const [name, value] of Object.entries(tokens)) {
        root.style.setProperty(name, value);
      }
      root.style.setProperty('--vscode-font-family', 'Arial, sans-serif');
      document.body.dataset.visualTheme = tokens['--visual-theme-name'];
    },
    { ...theme.tokens, '--visual-theme-name': theme.id }
  );
}

export function snapshotPath(
  fixture: VisualFixture,
  visualCase: VisualCase,
  testInfo: TestInfo
): string[] {
  const dpr = testInfo.project.name.endsWith('dpr2') ? 'dpr2' : 'dpr1';
  return [fixture.id, `${visualCase.id}-${dpr}.png`];
}

function themeTokens(input: {
  background: string;
  panel: string;
  border: string;
  text: string;
  muted: string;
  focus: string;
  button: string;
  buttonText: string;
  secondary: string;
  secondaryText: string;
}): Record<string, string> {
  return {
    '--bg': input.background,
    '--panel': input.panel,
    '--border': input.border,
    '--text': input.text,
    '--muted': input.muted,
    '--accent': input.focus,
    '--vscode-editor-background': input.background,
    '--vscode-editorWidget-background': input.panel,
    '--vscode-editorWidget-border': input.border,
    '--vscode-panel-border': input.border,
    '--vscode-foreground': input.text,
    '--vscode-descriptionForeground': input.muted,
    '--vscode-focusBorder': input.focus,
    '--vscode-button-background': input.button,
    '--vscode-button-foreground': input.buttonText,
    '--vscode-button-hoverBackground': input.button,
    '--vscode-button-secondaryBackground': input.secondary,
    '--vscode-button-secondaryForeground': input.secondaryText,
    '--vscode-input-background': input.panel,
    '--vscode-input-foreground': input.text,
    '--vscode-input-border': input.border,
    '--vscode-dropdown-background': input.panel,
    '--vscode-dropdown-foreground': input.text,
    '--vscode-menu-background': input.panel,
    '--vscode-badge-background': input.secondary,
    '--vscode-badge-foreground': input.secondaryText,
    '--vscode-list-hoverBackground': input.secondary
  };
}
