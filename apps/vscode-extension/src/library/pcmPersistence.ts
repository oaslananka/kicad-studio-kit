import * as fs from 'node:fs';
import * as path from 'node:path';
import { toKiCadPcmPackageJson, type PcmInstalledPackage } from './pcmCatalog';

export const PCM_INSTALLED_STATE_KEY = 'kicadstudio.pcm.installedPackages.v1';

export interface PcmStateStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export class PcmInstalledPackagePersistence {
  private readonly managedIdentifiers = new Set<string>();

  constructor(
    private readonly storage: PcmStateStorage,
    private readonly getConfigDir: () => string
  ) {}

  read(): PcmInstalledPackage[] {
    const value = this.storage.get<unknown>(PCM_INSTALLED_STATE_KEY);
    const installed = Array.isArray(value)
      ? value.filter(isInstalledPackage)
      : [];
    for (const entry of installed) {
      this.managedIdentifiers.add(entry.identifier);
    }
    return installed;
  }

  async write(installedEntries: Iterable<PcmInstalledPackage>): Promise<void> {
    const installed = [...installedEntries];
    for (const entry of installed) {
      this.managedIdentifiers.add(entry.identifier);
    }

    await this.storage.update(PCM_INSTALLED_STATE_KEY, installed);
    this.writeKiCadInstalledPackages(installed);
  }

  private writeKiCadInstalledPackages(installed: PcmInstalledPackage[]): void {
    const configDir = this.getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    const filePath = path.join(configDir, 'installed_packages.json');
    const existing = readJsonFile(filePath);
    const foreignPackages = Array.isArray(existing?.['packages'])
      ? (existing['packages'] as unknown[]).filter(
          (entry) =>
            !this.managedIdentifiers.has(readPackageIdentifier(entry) ?? '')
        )
      : [];
    const managedPackages = installed.map((entry) => ({
      package: toKiCadPcmPackageJson(entry.package),
      current_version: {
        version: entry.version
      },
      repository_id: entry.repositoryId,
      repository_name: entry.repositoryName,
      install_timestamp: Date.parse(entry.installedAt) / 1000 || 0,
      pinned: false
    }));

    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        { packages: [...foreignPackages, ...managedPackages] },
        null,
        2
      )}\n`,
      'utf8'
    );
  }
}

function isInstalledPackage(value: unknown): value is PcmInstalledPackage {
  const record = asRecord(value);
  const pkg = asRecord(record?.['package']);
  return Boolean(
    record &&
    pkg &&
    asString(record['identifier']) &&
    asString(record['version']) &&
    asString(pkg['identifier'])
  );
}

function readPackageIdentifier(value: unknown): string | undefined {
  return asString(asRecord(asRecord(value)?.['package'])?.['identifier']);
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
