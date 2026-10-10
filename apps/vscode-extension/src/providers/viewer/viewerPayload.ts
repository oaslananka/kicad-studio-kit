import type { SchematicFocusBounds } from './schematicFocusBounds';
import type {
  ViewerEngineState,
  ViewerMetadata,
  ViewerState
} from '../../types';
import { createViewerEngineState } from './viewerEngine';

export interface ViewerPayload {
  fileName: string;
  fileType: string;
  base64: string;
  schematicFocus?: SchematicFocusBounds | undefined;
  disabledReason: string;
  theme: string;
  fallbackBackground: string;
  engine: ViewerEngineState;
  metadata?: ViewerMetadata | undefined;
  restoreState?: ViewerState | undefined;
}

export interface ViewerPayloadOptions extends Omit<ViewerPayload, 'engine'> {
  initialEngine?: ViewerEngineState | undefined;
}

export function createViewerPayload(
  options: ViewerPayloadOptions
): ViewerPayload {
  const engine =
    options.initialEngine ??
    createViewerEngineState(
      options.disabledReason ? 'metadata-only' : 'kicanvas',
      options.disabledReason || undefined
    );
  return {
    fileName: options.fileName,
    fileType: options.fileType,
    base64: options.base64,
    ...(options.schematicFocus
      ? { schematicFocus: options.schematicFocus }
      : {}),
    disabledReason: options.disabledReason,
    theme: options.theme,
    fallbackBackground: options.fallbackBackground,
    engine,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.restoreState ? { restoreState: options.restoreState } : {})
  };
}
