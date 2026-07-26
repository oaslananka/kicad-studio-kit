import { PCM_PACKAGE_KINDS as LEGACY_PCM_PACKAGE_KINDS } from '../../src/library/pcmService';
import {
  PCM_PACKAGE_KINDS,
  classifyPcmPackage,
  comparePcmVersions,
  isPcmVersionNewer,
  normalizePcmPackage,
  scorePcmPackageMatch,
  toKiCadPcmPackageJson,
  type PcmPackageMetadata
} from '../../src/library/pcmCatalog';

const repository = {
  repositoryId: 'fixture-repository',
  repositoryName: 'Fixture Repository',
  repositoryUrl: 'https://example.test/repository.json'
};

describe('PCM catalog model (#497)', () => {
  it('normalizes package metadata and selects the newest non-deprecated version', () => {
    const pkg = normalizePcmPackage(
      {
        identifier: 'com.example.precision-symbols',
        name: 'Precision Symbols',
        description: 'Precision symbol library',
        description_full: 'A complete precision symbol library.',
        type: 'library',
        category: 'Symbols',
        tags: ['symbols', 'precision'],
        resources: { homepage: 'https://example.test' },
        versions: [
          {
            version: '1.1.0',
            version_epoch: 0,
            status: 'stable',
            download_url: 'https://example.test/1.1.0.zip',
            download_sha256: 'a'.repeat(64),
            platforms: ['linux', 'windows']
          },
          {
            version: '2.0.0',
            version_epoch: 0,
            status: 'deprecated'
          }
        ]
      },
      repository
    );

    expect(pkg).toEqual(
      expect.objectContaining({
        repositoryId: repository.repositoryId,
        repositoryName: repository.repositoryName,
        repositoryUrl: repository.repositoryUrl,
        state: 'available',
        contentTypes: ['symbols'],
        latestVersion: expect.objectContaining({ version: '1.1.0' })
      })
    );
    expect(pkg?.metadata.descriptionFull).toBe(
      'A complete precision symbol library.'
    );
  });

  it('rejects malformed packages and falls back to the newest deprecated version', () => {
    expect(normalizePcmPackage(null, repository)).toBeUndefined();
    expect(
      normalizePcmPackage({ name: 'Missing identifier' }, repository)
    ).toBeUndefined();
    expect(
      normalizePcmPackage({ identifier: 'missing-name' }, repository)
    ).toBeUndefined();

    const pkg = normalizePcmPackage(
      {
        identifier: 'com.example.legacy',
        name: 'Legacy Package',
        resources: { homepage: 'https://example.test', invalid: 42 },
        tags: ['legacy', 42],
        versions: [
          { version: '1.0.0', status: 'deprecated' },
          { version: '1.2.0', status: 'deprecated' },
          { status: 'stable' }
        ]
      },
      repository
    );

    expect(pkg?.latestVersion?.version).toBe('1.2.0');
    expect(pkg?.metadata.tags).toEqual(['legacy']);
    expect(pkg?.metadata.resources).toEqual({
      homepage: 'https://example.test'
    });
    expect(pkg?.metadata.versions).toHaveLength(2);
  });

  it('classifies plugin, theme, explicit library, and fallback package kinds', () => {
    const metadata = (overrides: Partial<PcmPackageMetadata>) =>
      ({
        name: 'Fixture',
        description: '',
        descriptionFull: '',
        identifier: 'com.example.fixture',
        type: 'library',
        tags: [],
        resources: {},
        versions: [],
        raw: {},
        ...overrides
      }) satisfies PcmPackageMetadata;

    expect(classifyPcmPackage(metadata({ type: 'plugin' }))).toEqual([
      'plugins'
    ]);
    expect(
      classifyPcmPackage(metadata({ name: 'Midnight Color Theme' }))
    ).toEqual(['color-themes']);
    expect(
      classifyPcmPackage(
        metadata({ description: 'Symbols, footprints and STEP models' })
      )
    ).toEqual(['symbols', 'footprints', '3d-models']);
    expect(classifyPcmPackage(metadata({}))).toEqual([
      'symbols',
      'footprints',
      '3d-models'
    ]);
  });

  it('compares dotted versions and honors version epochs', () => {
    expect(comparePcmVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(comparePcmVersions('1.0.0', '9.0.0', 2, 1)).toBeGreaterThan(0);
    expect(isPcmVersionNewer('2.0.0', '1.9.9')).toBe(true);
    expect(isPcmVersionNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('scores catalog matches deterministically', () => {
    const pkg = normalizePcmPackage(
      {
        identifier: 'com.example.precision-symbols',
        name: 'Precision Symbols',
        description: 'High accuracy analog components',
        type: 'library',
        tags: ['symbols', 'analog'],
        versions: [{ version: '1.0.0', status: 'stable' }]
      },
      repository
    );

    expect(pkg).toBeDefined();
    expect(scorePcmPackageMatch(pkg!, 'precision symbols')).toBeGreaterThan(
      scorePcmPackageMatch(pkg!, 'accuracy')
    );
    expect(scorePcmPackageMatch(pkg!, 'unrelated-query')).toBe(0);
  });

  it('serializes normalized metadata back to the KiCad package shape', () => {
    const pkg = normalizePcmPackage(
      {
        identifier: 'com.example.precision-symbols',
        name: 'Precision Symbols',
        description: 'Precision symbol library',
        description_full: 'Full description',
        type: 'library',
        custom_field: 'preserved',
        versions: [
          {
            version: '1.0.0',
            version_epoch: 3,
            status: 'stable',
            kicad_version: '10.0',
            platforms: ['linux']
          }
        ]
      },
      repository
    );

    expect(toKiCadPcmPackageJson(pkg!.metadata)).toEqual(
      expect.objectContaining({
        custom_field: 'preserved',
        identifier: 'com.example.precision-symbols',
        description_full: 'Full description',
        versions: [
          expect.objectContaining({
            version: '1.0.0',
            version_epoch: 3,
            kicad_version: '10.0',
            platforms: ['linux']
          })
        ]
      })
    );
  });

  it('preserves the legacy pcmService catalog exports', () => {
    expect(LEGACY_PCM_PACKAGE_KINDS).toBe(PCM_PACKAGE_KINDS);
  });
});
