import type {
  ViewerEngineCapabilities,
  ViewerEngineKind,
  ViewerEngineState
} from '../../types';

const ENGINE_LABELS: Record<ViewerEngineKind, string> = {
  kicanvas: 'KiCanvas',
  'cli-svg-fallback': 'CLI SVG fallback',
  'metadata-only': 'Metadata only',
  failed: 'Renderer failed'
};

const ENGINE_CAPABILITIES: Record<ViewerEngineKind, ViewerEngineCapabilities> =
  {
    kicanvas: {
      interactive: true,
      fit: true,
      zoom: true,
      exportPng: true,
      exportSvg: true,
      selection: true,
      layers: true
    },
    'cli-svg-fallback': {
      interactive: false,
      fit: true,
      zoom: true,
      exportPng: true,
      exportSvg: true,
      selection: false,
      layers: false
    },
    'metadata-only': {
      interactive: false,
      fit: false,
      zoom: false,
      exportPng: false,
      exportSvg: true,
      selection: false,
      layers: false
    },
    failed: {
      interactive: false,
      fit: false,
      zoom: false,
      exportPng: false,
      exportSvg: false,
      selection: false,
      layers: false
    }
  };

export function isViewerEngineKind(value: unknown): value is ViewerEngineKind {
  return (
    value === 'kicanvas' ||
    value === 'cli-svg-fallback' ||
    value === 'metadata-only' ||
    value === 'failed'
  );
}

export function createViewerEngineState(
  kind: ViewerEngineKind,
  reason?: string | undefined
): ViewerEngineState {
  return {
    kind,
    label: ENGINE_LABELS[kind],
    ...(reason ? { reason } : {}),
    capabilities: { ...ENGINE_CAPABILITIES[kind] }
  };
}

export function cloneViewerEngineState(
  state: ViewerEngineState
): ViewerEngineState {
  return {
    kind: state.kind,
    label: state.label,
    ...(state.reason ? { reason: state.reason } : {}),
    capabilities: { ...state.capabilities }
  };
}
