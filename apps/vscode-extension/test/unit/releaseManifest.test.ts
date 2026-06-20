import {
  buildReleaseManifest,
  collectGitMetadata,
  renderReleaseSummary,
  type BuildReleaseManifestInput
} from '../../src/commands/releaseManifest';

function baseInput(
  overrides: Partial<BuildReleaseManifestInput> = {}
): BuildReleaseManifestInput {
  return {
    extensionVersion: '1.8.1',
    timestamp: '2026-06-20T00:00:00.000Z',
    qualityGates: [],
    files: [],
    ...overrides
  };
}

describe('#400 release manifest', () => {
  describe('buildReleaseManifest', () => {
    it('emits the schema and required fields', () => {
      const manifest = buildReleaseManifest(baseInput());
      expect(manifest.schema).toBe('kicad-studio-release/1');
      expect(manifest.generatedBy).toBe('KiCad Studio Kit');
      expect(manifest.extensionVersion).toBe('1.8.1');
      expect(manifest.qualityGates).toEqual([]);
      expect(manifest.files).toEqual([]);
    });

    it('omits optional fields that are not provided', () => {
      const manifest = buildReleaseManifest(baseInput());
      expect('variant' in manifest).toBe(false);
      expect('git' in manifest).toBe(false);
      expect('kicad' in manifest).toBe(false);
      expect('mcpServerVersion' in manifest).toBe(false);
    });

    it('includes provided git, kicad, variant, and artifact data', () => {
      const manifest = buildReleaseManifest(
        baseInput({
          variant: 'assembly',
          git: { commit: 'abcdef0123456789', shortCommit: 'abcdef012345' },
          kicad: { version: '10.0.3', capabilities: ['gerbers', 'drill'] },
          mcpServerVersion: '3.9.2',
          qualityGates: [{ label: 'DRC', status: 'PASS', summary: '0 errors' }],
          files: [{ path: 'gerbers.zip', size: 1024, sha256: 'deadbeef' }]
        })
      );
      expect(manifest.variant).toBe('assembly');
      expect(manifest.git?.shortCommit).toBe('abcdef012345');
      expect(manifest.kicad?.capabilities).toContain('gerbers');
      expect(manifest.mcpServerVersion).toBe('3.9.2');
      expect(manifest.qualityGates[0]?.status).toBe('PASS');
      expect(manifest.files[0]?.sha256).toBe('deadbeef');
    });
  });

  describe('renderReleaseSummary', () => {
    it('renders gates and artifacts as tables', () => {
      const summary = renderReleaseSummary(
        buildReleaseManifest(
          baseInput({
            variant: 'assembly',
            kicad: { version: '10.0.3' },
            git: {
              commit: 'abcdef0123456789',
              shortCommit: 'abcdef012345',
              branch: 'main',
              dirty: true
            },
            qualityGates: [
              { label: 'DRC', status: 'PASS', summary: '0 errors' }
            ],
            files: [{ path: 'gerbers.zip', size: 2048, sha256: 'cafe' }]
          })
        )
      );
      expect(summary).toContain('# Manufacturing Release Summary');
      expect(summary).toContain('Variant: assembly');
      expect(summary).toContain('KiCad CLI: 10.0.3');
      expect(summary).toContain('abcdef012345');
      expect(summary).toContain('uncommitted changes');
      expect(summary).toContain('| DRC | PASS | 0 errors |');
      expect(summary).toContain('| gerbers.zip | 2048 | cafe |');
    });

    it('states when there are no gates or artifacts', () => {
      const summary = renderReleaseSummary(buildReleaseManifest(baseInput()));
      expect(summary).toContain('No quality gate results were recorded.');
      expect(summary).toContain('No artifacts were generated.');
    });

    it('escapes pipe characters in cell values', () => {
      const summary = renderReleaseSummary(
        buildReleaseManifest(
          baseInput({
            qualityGates: [
              { label: 'ERC', status: 'WARN', summary: 'a | b mismatch' }
            ]
          })
        )
      );
      expect(summary).toContain('a \\| b mismatch');
    });
  });

  describe('collectGitMetadata', () => {
    it('returns undefined when HEAD cannot be resolved', () => {
      const runner = () => {
        throw new Error('not a git repository');
      };
      expect(collectGitMetadata('/ws', runner)).toBeUndefined();
    });

    it('collects commit, branch, tag, and dirty flag', () => {
      const responses: Record<string, string> = {
        'rev-parse HEAD': 'abcdef0123456789abcdef',
        'rev-parse --abbrev-ref HEAD': 'main',
        'describe --tags --exact-match': 'v1.8.1',
        'status --porcelain': ' M file.kicad_pcb'
      };
      const metadata = collectGitMetadata('/ws', (args) => {
        const key = args.join(' ');
        if (key in responses) {
          return responses[key]!;
        }
        throw new Error(`unexpected git args: ${key}`);
      });
      expect(metadata).toEqual({
        commit: 'abcdef0123456789abcdef',
        shortCommit: 'abcdef012345',
        branch: 'main',
        tag: 'v1.8.1',
        dirty: true
      });
    });

    it('omits branch HEAD and reports a clean tree', () => {
      const responses: Record<string, string> = {
        'rev-parse HEAD': '0123456789abcdef',
        'rev-parse --abbrev-ref HEAD': 'HEAD',
        'status --porcelain': ''
      };
      const metadata = collectGitMetadata('/ws', (args) => {
        const key = args.join(' ');
        if (key in responses) {
          return responses[key]!;
        }
        throw new Error('no tag');
      });
      expect(metadata?.branch).toBeUndefined();
      expect(metadata?.tag).toBeUndefined();
      expect(metadata?.dirty).toBe(false);
    });
  });
});
