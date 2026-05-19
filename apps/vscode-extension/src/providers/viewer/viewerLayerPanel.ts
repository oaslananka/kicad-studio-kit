import type { ViewerMetadata } from '../../types';

export function getViewerSidebarWidth(
  metadata: ViewerMetadata | undefined
): string {
  return metadata?.layers?.length || metadata?.tuningProfiles?.length
    ? '320px'
    : '240px';
}
