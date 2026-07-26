import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PcmInstalledPackage } from '../../src/library/pcmCatalog';
import {
  PCM_INSTALLED_STATE_KEY,
  PcmInstalledPackagePersistence,
  type PcmStateStorage
} from '../../src/library/pcmPersistence';

class MemoryStateStorage implements PcmStateStorage {
  readonly values = new Map<string, unknown>();
  readonly updates: Array<{ key: string; value: unknown }> = [];

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.updates.push({ key, value });
    this.values.set(key, value);
  }
}

function tempConfigDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-pcm-state-'));
}

function installed(
  identifier: string,
  options: { installedAt?: string; version?: string } = {}
): PcmInstalledPackage {
  const version = options.version ?? '1.2.3';
  return {
    identifier,
    version,
    repositoryId: 'fixture-repository',
    repositoryName: 'Fixture Repository',
    repositoryUrl: 'https://example.com/repository.json',
    installedAt: options.installedAt ?? '2026-07-26T12:00:00.000Z',
    installPath: `/tmp/${identifier}`,
    extractedFiles: [`/tmp/${identifier}/Fixture.kicad_sym`],
    checksum: 'a'.repeat(64),
    source: 'direct',
    package: {
      name: `Package ${identifier}`,
      description: 'Fixture package',
      descriptionFull: 'Fixture package for persistence tests.',
      identifier,
      type: 'library',
      category: 'symbols',
      license: 'MIT',
      tags: ['fixture'],
      resources: {},
      versions: [
        {
          version,
          versionEpoch: 0,
          status: 'stable',
          kicadVersion: '10.0',
          platforms: []
        }
      ],
      raw: {
        identifier,
        custom_field: 'preserved'
      }
    }
  };
}

function readInstalledPackages(
  configDir: string
): Array<Record<string, unknown>> {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(configDir, 'installed_packages.json'), 'utf8')
  ) as { packages: Array<Record<string, unknown>> };
  return parsed.packages;
}

describe('PCM installed-state persistence boundary (#497)', () => {
  it('filters malformed global-state entries and preserves valid installed packages', () => {
    const storage = new MemoryStateStorage();
    const valid = installed('com.example.valid');
    storage.values.set(PCM_INSTALLED_STATE_KEY, [
      valid,
      null,
      { identifier: 'missing-version', package: valid.package },
      { identifier: 'missing-package', version: '1.0.0' },
      { ...valid, package: { name: 'missing identifier' } }
    ]);
    const persistence = new PcmInstalledPackagePersistence(
      storage,
      tempConfigDir
    );

    expect(persistence.read()).toEqual([valid]);
  });

  it('writes global state and preserves foreign KiCad package records', async () => {
    const storage = new MemoryStateStorage();
    const configDir = tempConfigDir();
    const foreign = {
      package: { identifier: 'org.kicad.foreign', name: 'Foreign Package' },
      current_version: { version: '9.9.9' },
      repository_id: 'foreign'
    };
    fs.writeFileSync(
      path.join(configDir, 'installed_packages.json'),
      `${JSON.stringify({ packages: [foreign] }, null, 2)}\n`,
      'utf8'
    );
    const current = installed('com.example.current');
    const persistence = new PcmInstalledPackagePersistence(
      storage,
      () => configDir
    );

    await persistence.write([current]);

    expect(storage.updates).toEqual([
      { key: PCM_INSTALLED_STATE_KEY, value: [current] }
    ]);
    const packages = readInstalledPackages(configDir);
    expect(packages).toHaveLength(2);
    expect(packages[0]).toEqual(foreign);
    expect(packages[1]).toEqual(
      expect.objectContaining({
        package: expect.objectContaining({
          identifier: 'com.example.current',
          custom_field: 'preserved'
        }),
        current_version: { version: '1.2.3' },
        repository_id: 'fixture-repository',
        repository_name: 'Fixture Repository',
        install_timestamp: Date.parse('2026-07-26T12:00:00.000Z') / 1000,
        pinned: false
      })
    );
  });

  it('removes previously managed records while retaining foreign records', async () => {
    const storage = new MemoryStateStorage();
    const configDir = tempConfigDir();
    const old = installed('com.example.old');
    const foreign = {
      package: { identifier: 'org.kicad.foreign' },
      current_version: { version: '1.0.0' }
    };
    storage.values.set(PCM_INSTALLED_STATE_KEY, [old]);
    fs.writeFileSync(
      path.join(configDir, 'installed_packages.json'),
      `${JSON.stringify(
        {
          packages: [
            foreign,
            {
              package: { identifier: old.identifier },
              current_version: { version: old.version }
            }
          ]
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    const persistence = new PcmInstalledPackagePersistence(
      storage,
      () => configDir
    );

    expect(persistence.read()).toEqual([old]);
    await persistence.write([]);

    expect(storage.get(PCM_INSTALLED_STATE_KEY)).toEqual([]);
    expect(readInstalledPackages(configDir)).toEqual([foreign]);
  });

  it('recovers from malformed JSON and serializes invalid timestamps as zero', async () => {
    const storage = new MemoryStateStorage();
    const configDir = tempConfigDir();
    fs.writeFileSync(
      path.join(configDir, 'installed_packages.json'),
      '{ malformed',
      'utf8'
    );
    const current = installed('com.example.invalid-time', {
      installedAt: 'not-a-date'
    });
    const persistence = new PcmInstalledPackagePersistence(
      storage,
      () => configDir
    );

    await persistence.write([current]);

    expect(readInstalledPackages(configDir)).toEqual([
      expect.objectContaining({
        package: expect.objectContaining({ identifier: current.identifier }),
        install_timestamp: 0
      })
    ]);
  });
});
