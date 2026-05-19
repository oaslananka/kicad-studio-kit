export interface ViewerPalette {
  colorScheme: 'dark' | 'light';
  bg: string;
  panel: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
  green: string;
}

export function resolveViewerPalette(theme: string): ViewerPalette {
  if (theme === 'light') {
    return {
      colorScheme: 'light',
      bg: '#f8fafc',
      panel: 'rgba(255,255,255,0.92)',
      card: 'rgba(255,255,255,0.78)',
      border: 'rgba(15,23,42,0.12)',
      text: '#0f172a',
      muted: '#475569',
      accent: '#0369a1',
      danger: '#dc2626',
      green: '#15803d'
    };
  }

  return {
    colorScheme: 'dark',
    bg: '#050816',
    panel: 'rgba(15,23,42,.94)',
    card: 'rgba(15,23,42,.72)',
    border: 'rgba(148,163,184,.22)',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#38bdf8',
    danger: '#fca5a5',
    green: '#86efac'
  };
}
