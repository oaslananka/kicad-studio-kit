import { Script } from 'node:vm';
import { createViewerControllerScript } from '../../src/providers/viewer/viewerControllerScript';

describe('createViewerControllerScript', () => {
  it('returns the standalone strict-mode viewer controller', () => {
    const source = createViewerControllerScript();

    expect(source).toContain("'use strict';");
    expect(source).toContain('const vscode = acquireVsCodeApi();');
    expect(source).toContain("window.addEventListener('message'");
    expect(source).toContain("vscode.postMessage({ type: 'ready'");
    expect(source).not.toContain('<script');
    expect(() => new Script(source)).not.toThrow();
  });
});
