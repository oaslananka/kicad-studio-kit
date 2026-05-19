import type { ViewerMetadata, ViewerState } from '../../types';

export interface ViewerPayload {
  fileName: string;
  fileType: string;
  base64: string;
  disabledReason: string;
  theme: string;
  fallbackBackground: string;
  metadata?: ViewerMetadata | undefined;
  restoreState?: ViewerState | undefined;
}

export function createViewerPayload(options: ViewerPayload): ViewerPayload {
  return {
    fileName: options.fileName,
    fileType: options.fileType,
    base64: options.base64,
    disabledReason: options.disabledReason,
    theme: options.theme,
    fallbackBackground: options.fallbackBackground,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.restoreState ? { restoreState: options.restoreState } : {})
  };
}
