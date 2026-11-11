import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { KiCadStatusBar } from './kicadStatusBar';

/** Keep the visible CLI version in sync with Settings, even after rapid edits. */
export function makeCliRefresh(
  detector: Pick<KiCadCliDetector, 'detect'>,
  statusBar: Pick<KiCadStatusBar, 'update'>,
  isTrusted: () => boolean
): () => void {
  let request = 0;
  return () => {
    const current = ++request;
    // Never display a previous executable while validating a replacement.
    statusBar.update({ cli: undefined });
    if (!isTrusted()) return;
    void detector
      .detect()
      .then((cli) => {
        if (current === request) statusBar.update({ cli });
      })
      .catch(() => {
        if (current === request) statusBar.update({ cli: undefined });
      });
  };
}
