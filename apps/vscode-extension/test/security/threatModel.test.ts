import * as fs from 'node:fs';
import * as path from 'node:path';

// Repo root is four levels up from apps/vscode-extension/test/security.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const THREAT_MODEL = path.join(
  REPO_ROOT,
  'docs',
  'security',
  'threat-model.md'
);

function readThreatModel(): string {
  return fs.readFileSync(THREAT_MODEL, 'utf8');
}

describe('threat model (#413)', () => {
  it('exists and documents the required sections', () => {
    const doc = readThreatModel();
    for (const section of [
      '# Threat Model',
      '## Assets',
      '## Trust Boundaries',
      '## Threats and Mitigations',
      '## Residual Risks',
      '## Reporting'
    ]) {
      expect(doc).toContain(section);
    }
  });

  it('covers each enumerated threat scenario', () => {
    const doc = readThreatModel();
    for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8']) {
      expect(doc).toMatch(new RegExp(`\\|\\s*${id}\\s*\\|`, 'u'));
    }
  });

  it('names the modeled attack classes', () => {
    const doc = readThreatModel().toLowerCase();
    for (const phrase of [
      'path traversal',
      'symlink',
      'untrusted',
      'kicad-cli',
      'mcp endpoint',
      'webview',
      'secret'
    ]) {
      expect(doc).toContain(phrase);
    }
  });

  it('every evidence file referenced in the model actually exists', () => {
    const doc = readThreatModel();
    const evidence = new Set<string>(
      Array.from(
        doc.matchAll(/`(apps\/vscode-extension\/[^`]+\.(?:ts|md))`/gu),
        (match) => match[1]
      ).filter((rel): rel is string => Boolean(rel))
    );
    // The model must cite real mitigations, not aspirational ones.
    expect(evidence.size).toBeGreaterThanOrEqual(8);
    const missing = [...evidence].filter(
      (rel) => !fs.existsSync(path.join(REPO_ROOT, rel))
    );
    expect(missing).toEqual([]);
  });

  it('documents at least one accepted residual risk', () => {
    const doc = readThreatModel();
    const residual = doc.slice(doc.indexOf('## Residual Risks'));
    // Bullet list under the residual-risks heading.
    expect(residual).toMatch(/\n- /u);
  });
});
