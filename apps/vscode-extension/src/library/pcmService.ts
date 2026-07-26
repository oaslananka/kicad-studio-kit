import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { KiCadCliRunner } from '../cli/kicadCliRunner';
import type { ComponentSearchResult } from '../types';
import { normalizeUserPath } from '../utils/pathUtils';
import type { Logger } from '../utils/logger';
import type { KiCadLibraryIndexer } from './libraryIndexer';
import { assertPcmSha256, extractPcmZipArchive } from './pcmArchive';
import { PcmLibraryTablePersistence } from './pcmLibraryTable';
import { PcmInstalledPackagePersistence } from './pcmPersistence';
import {
  isPcmVersionNewer,
  normalizePcmPackage,
  scorePcmPackageMatch,
  type PcmInstalledPackage,
  type PcmInstallState,
  type PcmPackage,
  type PcmPackageVersion,
  type PcmRepository
} from './pcmCatalog';

export {
  PCM_PACKAGE_KINDS,
  type PcmInstalledPackage,
  type PcmInstallState,
  type PcmPackage,
  type PcmPackageKind,
  type PcmPackageMetadata,
  type PcmPackageVersion,
  type PcmRepository
} from './pcmCatalog';

export interface PcmServiceOptions {
  fetchBytes?: (url: string, accept: string) => Promise<Buffer> | Buffer;
  extractArchive?: (
    archive: Buffer,
    targetDir: string,
    pkg: PcmPackage
  ) => Promise<string[]> | string[];
  now?: () => Date;
  configDir?: string | undefined;
  thirdPartyDir?: string | undefined;
}

export const DEFAULT_PCM_REPOSITORY_URL =
  'https://repository.kicad.org/repository.json';

const PCM_ACCEPT = 'application/vnd.kicad.pcm.v2+json, application/json;q=0.9';

export class PcmService implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly installed = new Map<string, PcmInstalledPackage>();
  private readonly libraryTables: PcmLibraryTablePersistence;
  private readonly persistence: PcmInstalledPackagePersistence;
  private repositories: PcmRepository[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly cliDetector: KiCadCliDetector,
    private readonly cliRunner: KiCadCliRunner,
    private readonly libraryIndexer: KiCadLibraryIndexer,
    private readonly logger: Logger,
    private readonly options: PcmServiceOptions = {}
  ) {
    this.persistence = new PcmInstalledPackagePersistence(
      context.globalState,
      () => this.getConfigDir()
    );
    this.libraryTables = new PcmLibraryTablePersistence(() =>
      this.getConfigDir()
    );
    for (const entry of this.persistence.read()) {
      this.installed.set(entry.identifier, entry);
    }
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
  }

  getPackages(): PcmPackage[] {
    return this.repositories.flatMap((repository) => repository.packages);
  }

  getRepositories(): PcmRepository[] {
    return this.repositories;
  }

  getInstalledPackages(): PcmInstalledPackage[] {
    return [...this.installed.values()];
  }

  async refreshRepositories(): Promise<PcmPackage[]> {
    const repositories: PcmRepository[] = [];
    for (const repositoryUrl of this.getRepositoryUrls()) {
      try {
        repositories.push(await this.loadRepository(repositoryUrl));
      } catch (error) {
        this.logger.warn(
          `PCM repository refresh failed for ${repositoryUrl}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    this.repositories = repositories;
    this.onDidChangeEmitter.fire();
    return this.getPackages();
  }

  async installPackage(
    target: string | PcmPackage
  ): Promise<PcmInstalledPackage> {
    const pkg = await this.resolvePackage(target);
    const version = pkg.latestVersion;
    if (!version) {
      throw new Error(
        `PCM package ${pkg.metadata.identifier} has no installable version.`
      );
    }

    const existing = this.installed.get(pkg.metadata.identifier);
    if (existing?.version === version.version) {
      return existing;
    }

    if (await this.hasCliPcmInstall()) {
      await this.installWithCli(pkg);
      const installed = this.buildInstalledEntry(pkg, version, {
        source: 'cli',
        installPath: this.getThirdPartyDir(),
        extractedFiles: []
      });
      await this.persistInstalled(installed);
      return installed;
    }

    const installed = await this.installDirect(pkg, version);
    await this.persistInstalled(installed);
    return installed;
  }

  async updatePackage(
    target: string | PcmPackage
  ): Promise<PcmInstalledPackage> {
    const pkg = await this.resolvePackage(target);
    const installed = this.installed.get(pkg.metadata.identifier);
    if (!installed) {
      return this.installPackage(pkg);
    }
    if (!this.isUpdateAvailable(pkg)) {
      return installed;
    }
    await this.removeDirectInstallFiles(installed);
    return this.installPackage(pkg);
  }

  async updateAllPackages(): Promise<PcmInstalledPackage[]> {
    const packages = this.getPackages().filter((pkg) =>
      this.isUpdateAvailable(pkg)
    );
    const results: PcmInstalledPackage[] = [];
    for (const pkg of packages) {
      results.push(await this.updatePackage(pkg));
    }
    return results;
  }

  async uninstallPackage(target: string | PcmPackage): Promise<void> {
    const identifier =
      typeof target === 'string' ? target : target.metadata.identifier;
    const installed = this.installed.get(identifier);
    if (!installed) {
      return;
    }

    await this.removeDirectInstallFiles(installed);
    this.installed.delete(identifier);
    await this.persistence.write(this.installed.values());
    await this.refreshLibraryIndex();
    this.refreshPackageStates();
    this.onDidChangeEmitter.fire();
  }

  isUpdateAvailable(pkg: PcmPackage): boolean {
    return Boolean(
      pkg.installed &&
      pkg.latestVersion &&
      isPcmVersionNewer(
        pkg.latestVersion.version,
        pkg.installed.version,
        pkg.latestVersion.versionEpoch,
        pkg.installed.package.versions.find(
          (version) => version.version === pkg.installed?.version
        )?.versionEpoch ?? 0
      )
    );
  }

  async findInstallCandidateForResult(
    result: ComponentSearchResult
  ): Promise<PcmPackage | undefined> {
    if (!this.repositories.length) {
      await this.refreshRepositories();
    }
    const haystack = [
      result.mpn,
      result.lcscPartNumber,
      result.description,
      result.category,
      ...result.specs.map((spec) => `${spec.name} ${spec.value}`)
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();
    if (!haystack.trim()) {
      return undefined;
    }

    return this.getPackages()
      .filter((pkg) => pkg.state !== 'installed')
      .filter((pkg) =>
        pkg.contentTypes.some(
          (kind) => kind === 'symbols' || kind === 'footprints'
        )
      )
      .map((pkg) => ({ pkg, score: scorePcmPackageMatch(pkg, haystack) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.pkg;
  }

  async findPackages(query: string): Promise<PcmPackage[]> {
    if (!this.repositories.length) {
      await this.refreshRepositories();
    }
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return this.getPackages()
      .map((pkg) => ({
        pkg,
        score: scorePcmPackageMatch(pkg, normalized)
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 10)
      .map((entry) => entry.pkg);
  }

  getConfigDir(): string {
    const configured =
      this.options.configDir ??
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.pcmConfigDir, '')
        .trim();
    if (configured) {
      return path.resolve(normalizeUserPath(configured));
    }
    const envConfig = process.env['KICAD_CONFIG_HOME'];
    if (envConfig) {
      return path.resolve(normalizeUserPath(envConfig));
    }
    if (process.platform === 'win32') {
      return path.join(process.env['APPDATA'] ?? os.homedir(), 'kicad');
    }
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Preferences', 'kicad');
    }
    return path.join(
      process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config'),
      'kicad'
    );
  }

  getThirdPartyDir(): string {
    const configured =
      this.options.thirdPartyDir ??
      vscode.workspace
        .getConfiguration()
        .get<string>(SETTINGS.pcmThirdPartyDir, '')
        .trim();
    if (configured) {
      return path.resolve(normalizeUserPath(configured));
    }
    for (const key of [
      'KICAD10_3RD_PARTY',
      'KICAD9_3RD_PARTY',
      'KICAD8_3RD_PARTY',
      'KICADX_3RD_PARTY'
    ]) {
      const value = process.env[key];
      if (value) {
        return path.resolve(normalizeUserPath(value));
      }
    }
    return path.join(this.getConfigDir(), '3rdparty');
  }

  private async resolvePackage(
    target: string | PcmPackage
  ): Promise<PcmPackage> {
    if (typeof target !== 'string') {
      return target;
    }
    if (!this.repositories.length) {
      await this.refreshRepositories();
    }
    const pkg = this.getPackages().find(
      (candidate) => candidate.metadata.identifier === target
    );
    if (!pkg) {
      throw new Error(`PCM package not found: ${target}`);
    }
    return pkg;
  }

  private async loadRepository(repositoryUrl: string): Promise<PcmRepository> {
    const repositoryBytes = await this.fetchBytes(repositoryUrl);
    const repositoryRaw = parseJsonObject(repositoryBytes, repositoryUrl);
    const resource = asRecord(repositoryRaw['packages']);
    const packageResourceUrl = asString(resource?.['url']);
    if (!packageResourceUrl) {
      throw new Error('PCM repository does not declare a packages resource.');
    }

    const resolvedPackageUrl = resolveUrl(packageResourceUrl, repositoryUrl);
    const packageBytes = await this.fetchBytes(resolvedPackageUrl);
    const expectedSha256 = asString(resource?.['sha256']);
    if (expectedSha256) {
      assertPcmSha256(packageBytes, expectedSha256, resolvedPackageUrl);
    }

    const packageListRaw = parseJsonObject(packageBytes, resolvedPackageUrl);
    const rawPackages = Array.isArray(packageListRaw['packages'])
      ? packageListRaw['packages']
      : Array.isArray(packageListRaw)
        ? packageListRaw
        : [];
    const repositoryName =
      asString(repositoryRaw['name']) ?? new URL(repositoryUrl).hostname;
    const repositoryId = createRepositoryId(repositoryUrl);
    const fetchedAt = this.now().toISOString();
    const packages = rawPackages
      .map((raw) =>
        normalizePcmPackage(raw, {
          repositoryId,
          repositoryName,
          repositoryUrl
        })
      )
      .filter((pkg): pkg is PcmPackage => Boolean(pkg));

    return {
      id: repositoryId,
      name: repositoryName,
      url: repositoryUrl,
      packageResourceUrl: resolvedPackageUrl,
      packages: packages.map((pkg) => this.withState(pkg)),
      fetchedAt
    };
  }

  private async installWithCli(pkg: PcmPackage): Promise<void> {
    await this.cliRunner.runWithProgress({
      command: ['pcm', 'install', pkg.metadata.identifier],
      cwd: getCommandCwd(),
      progressTitle: `Installing PCM package ${pkg.metadata.name}`
    });
  }

  private async installDirect(
    pkg: PcmPackage,
    version: PcmPackageVersion
  ): Promise<PcmInstalledPackage> {
    if (!version.downloadUrl || !version.downloadSha256) {
      throw new Error(
        `PCM package ${pkg.metadata.identifier} does not provide a download URL and SHA-256 checksum.`
      );
    }
    const archive = await this.fetchBytes(version.downloadUrl);
    assertPcmSha256(archive, version.downloadSha256, version.downloadUrl);

    const installPath = path.join(
      this.getThirdPartyDir(),
      sanitizeIdentifier(pkg.metadata.identifier)
    );
    const extractedFiles = this.options.extractArchive
      ? await this.extractWithInjectedAdapter(archive, installPath, pkg)
      : extractPcmZipArchive(archive, installPath);

    this.libraryTables.refresh(pkg, installPath);

    return this.buildInstalledEntry(pkg, version, {
      source: 'direct',
      installPath,
      extractedFiles,
      checksum: version.downloadSha256
    });
  }

  private buildInstalledEntry(
    pkg: PcmPackage,
    version: PcmPackageVersion,
    details: {
      source: 'cli' | 'direct';
      installPath?: string | undefined;
      extractedFiles: string[];
      checksum?: string | undefined;
    }
  ): PcmInstalledPackage {
    return {
      identifier: pkg.metadata.identifier,
      version: version.version,
      repositoryId: pkg.repositoryId,
      repositoryName: pkg.repositoryName,
      repositoryUrl: pkg.repositoryUrl,
      installedAt: this.now().toISOString(),
      installPath: details.installPath,
      extractedFiles: details.extractedFiles,
      checksum: details.checksum,
      source: details.source,
      package: pkg.metadata
    };
  }

  private async persistInstalled(
    installed: PcmInstalledPackage
  ): Promise<void> {
    this.installed.set(installed.identifier, installed);
    await this.persistence.write(this.installed.values());
    await this.refreshLibraryIndex();
    this.refreshPackageStates();
    this.onDidChangeEmitter.fire();
  }

  private async removeDirectInstallFiles(
    installed: PcmInstalledPackage
  ): Promise<void> {
    this.libraryTables.remove(installed.identifier);
    if (installed.source === 'direct' && installed.installPath) {
      const thirdParty = path.resolve(this.getThirdPartyDir());
      const installPath = path.resolve(installed.installPath);
      if (installPath.startsWith(thirdParty + path.sep)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }
    }
  }

  private async extractWithInjectedAdapter(
    archive: Buffer,
    installPath: string,
    pkg: PcmPackage
  ): Promise<string[]> {
    fs.rmSync(installPath, { recursive: true, force: true });
    fs.mkdirSync(installPath, { recursive: true });
    return await this.options.extractArchive!(archive, installPath, pkg);
  }

  private async refreshLibraryIndex(): Promise<void> {
    try {
      await this.libraryIndexer.indexAll();
    } catch (error) {
      this.logger.warn(
        `Library reindex after PCM operation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private refreshPackageStates(): void {
    this.repositories = this.repositories.map((repository) => ({
      ...repository,
      packages: repository.packages.map((pkg) => this.withState(pkg))
    }));
  }

  private withState(pkg: PcmPackage): PcmPackage {
    const installed = this.installed.get(pkg.metadata.identifier);
    const state: PcmInstallState = installed
      ? pkg.latestVersion &&
        isPcmVersionNewer(
          pkg.latestVersion.version,
          installed.version,
          pkg.latestVersion.versionEpoch,
          installed.package.versions.find(
            (version) => version.version === installed.version
          )?.versionEpoch ?? 0
        )
        ? 'update-available'
        : 'installed'
      : 'available';
    return {
      ...pkg,
      state,
      installed
    };
  }

  private getRepositoryUrls(): string[] {
    const configured = vscode.workspace
      .getConfiguration()
      .get<string[]>(SETTINGS.pcmRepositoryUrls, [DEFAULT_PCM_REPOSITORY_URL]);
    const urls = configured.length ? configured : [DEFAULT_PCM_REPOSITORY_URL];
    return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  }

  private async hasCliPcmInstall(): Promise<boolean> {
    const help = await this.cliDetector.getCommandHelp(['pcm', 'install']);
    return Boolean(help && /install/i.test(help));
  }

  private async fetchBytes(url: string): Promise<Buffer> {
    if (this.options.fetchBytes) {
      return Buffer.from(await this.options.fetchBytes(url, PCM_ACCEPT));
    }
    if (url.startsWith('file://')) {
      return fs.readFileSync(new URL(url));
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
      return fs.readFileSync(path.resolve(normalizeUserPath(url)));
    }
    const response = await fetch(url, {
      headers: { Accept: PCM_ACCEPT }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function createRepositoryId(repositoryUrl: string): string {
  return crypto
    .createHash('sha256')
    .update(repositoryUrl)
    .digest('hex')
    .slice(0, 16);
}

function parseJsonObject(
  bytes: Buffer,
  label: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    throw new Error(
      `PCM JSON parse failed for ${label}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  throw new Error(`PCM JSON from ${label} was not an object.`);
}

function resolveUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function sanitizeIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9._-]+/gu, '_').replace(/\./gu, '_');
}

function getCommandCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
