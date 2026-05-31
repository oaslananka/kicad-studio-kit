import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as vscode from 'vscode';
import { SETTINGS } from '../constants';
import type { KiCadCliDetector } from '../cli/kicadCliDetector';
import type { KiCadCliRunner } from '../cli/kicadCliRunner';
import type { ComponentSearchResult } from '../types';
import { normalizeUserPath } from '../utils/pathUtils';
import type { Logger } from '../utils/logger';
import type { KiCadLibraryIndexer } from './libraryIndexer';

export type PcmPackageKind =
  | 'symbols'
  | 'footprints'
  | '3d-models'
  | 'plugins'
  | 'color-themes';

export type PcmInstallState =
  | 'available'
  | 'installed'
  | 'update-available';

export interface PcmPackageVersion {
  version: string;
  versionEpoch: number;
  downloadUrl?: string | undefined;
  downloadSha256?: string | undefined;
  status: 'stable' | 'testing' | 'development' | 'deprecated' | string;
  kicadVersion?: string | undefined;
  platforms: string[];
}

export interface PcmPackageMetadata {
  name: string;
  description: string;
  descriptionFull: string;
  identifier: string;
  type: string;
  category?: string | undefined;
  license?: string | undefined;
  tags: string[];
  resources: Record<string, string>;
  versions: PcmPackageVersion[];
  raw: Record<string, unknown>;
}

export interface PcmInstalledPackage {
  identifier: string;
  version: string;
  repositoryId: string;
  repositoryName: string;
  repositoryUrl: string;
  installedAt: string;
  installPath?: string | undefined;
  extractedFiles: string[];
  checksum?: string | undefined;
  source: 'cli' | 'direct';
  package: PcmPackageMetadata;
}

export interface PcmPackage {
  repositoryId: string;
  repositoryName: string;
  repositoryUrl: string;
  metadata: PcmPackageMetadata;
  latestVersion?: PcmPackageVersion | undefined;
  contentTypes: PcmPackageKind[];
  state: PcmInstallState;
  installed?: PcmInstalledPackage | undefined;
}

export interface PcmRepository {
  id: string;
  name: string;
  url: string;
  packageResourceUrl: string;
  packages: PcmPackage[];
  fetchedAt: string;
}

export interface PcmServiceOptions {
  fetchBytes?: (
    url: string,
    accept: string
  ) => Promise<Buffer> | Buffer;
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

export const PCM_PACKAGE_KINDS: Array<{
  kind: PcmPackageKind;
  label: string;
}> = [
  { kind: 'symbols', label: 'Symbols' },
  { kind: 'footprints', label: 'Footprints' },
  { kind: '3d-models', label: '3D Models' },
  { kind: 'plugins', label: 'Plugins' },
  { kind: 'color-themes', label: 'Color Themes' }
];

const PCM_STATE_KEY = 'kicadstudio.pcm.installedPackages.v1';
const PCM_ACCEPT =
  'application/vnd.kicad.pcm.v2+json, application/json;q=0.9';

export class PcmService implements vscode.Disposable {
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly installed = new Map<string, PcmInstalledPackage>();
  private readonly managedIdentifiers = new Set<string>();
  private repositories: PcmRepository[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly cliDetector: KiCadCliDetector,
    private readonly cliRunner: KiCadCliRunner,
    private readonly libraryIndexer: KiCadLibraryIndexer,
    private readonly logger: Logger,
    private readonly options: PcmServiceOptions = {}
  ) {
    for (const entry of readInstalledState(context)) {
      this.installed.set(entry.identifier, entry);
      this.managedIdentifiers.add(entry.identifier);
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

  async installPackage(target: string | PcmPackage): Promise<PcmInstalledPackage> {
    const pkg = await this.resolvePackage(target);
    const version = pkg.latestVersion;
    if (!version) {
      throw new Error(`PCM package ${pkg.metadata.identifier} has no installable version.`);
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

  async updatePackage(target: string | PcmPackage): Promise<PcmInstalledPackage> {
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
    const identifier = typeof target === 'string' ? target : target.metadata.identifier;
    const installed = this.installed.get(identifier);
    if (!installed) {
      return;
    }

    await this.removeDirectInstallFiles(installed);
    this.installed.delete(identifier);
    await this.context.globalState.update(
      PCM_STATE_KEY,
      [...this.installed.values()]
    );
    await this.writeKiCadInstalledPackages();
    await this.refreshLibraryIndex();
    this.refreshPackageStates();
    this.onDidChangeEmitter.fire();
  }

  isUpdateAvailable(pkg: PcmPackage): boolean {
    return Boolean(
      pkg.installed &&
        pkg.latestVersion &&
        isVersionNewer(
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
      .map((pkg) => ({ pkg, score: scorePackageMatch(pkg, haystack) }))
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
        score: scorePackageMatch(pkg, normalized)
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

  private async resolvePackage(target: string | PcmPackage): Promise<PcmPackage> {
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
      assertSha256(packageBytes, expectedSha256, resolvedPackageUrl);
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
        normalizePackage(raw, {
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
    assertSha256(archive, version.downloadSha256, version.downloadUrl);

    const installPath = path.join(
      this.getThirdPartyDir(),
      sanitizeIdentifier(pkg.metadata.identifier)
    );
    fs.rmSync(installPath, { recursive: true, force: true });
    fs.mkdirSync(installPath, { recursive: true });
    const extractedFiles = await (this.options.extractArchive
      ? this.options.extractArchive(archive, installPath, pkg)
      : extractZipArchive(archive, installPath));

    await this.refreshLibraryTables(pkg, installPath);

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
    this.managedIdentifiers.add(installed.identifier);
    await this.context.globalState.update(
      PCM_STATE_KEY,
      [...this.installed.values()]
    );
    await this.writeKiCadInstalledPackages();
    await this.refreshLibraryIndex();
    this.refreshPackageStates();
    this.onDidChangeEmitter.fire();
  }

  private async removeDirectInstallFiles(
    installed: PcmInstalledPackage
  ): Promise<void> {
    await this.removeManagedLibraryEntries(installed.identifier);
    if (installed.source === 'direct' && installed.installPath) {
      const thirdParty = path.resolve(this.getThirdPartyDir());
      const installPath = path.resolve(installed.installPath);
      if (installPath.startsWith(thirdParty + path.sep)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }
    }
  }

  private async refreshLibraryTables(
    pkg: PcmPackage,
    installPath: string
  ): Promise<void> {
    const symbolLibraries = collectPaths(installPath, (entry) =>
      entry.endsWith('.kicad_sym')
    );
    const footprintLibraries = collectDirectories(installPath, (entry) =>
      entry.endsWith('.pretty')
    );
    const prefix = managedLibraryPrefix(pkg.metadata.identifier);
    const configDir = this.getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });

    upsertLibraryTable({
      filePath: path.join(configDir, 'sym-lib-table'),
      rootName: 'sym_lib_table',
      namePrefix: prefix,
      entries: symbolLibraries.map((libraryPath) => ({
        name: `${prefix}_${path.basename(libraryPath, '.kicad_sym')}`,
        uri: libraryPath,
        description: `Installed by KiCad Studio PCM: ${pkg.metadata.name}`
      }))
    });
    upsertLibraryTable({
      filePath: path.join(configDir, 'fp-lib-table'),
      rootName: 'fp_lib_table',
      namePrefix: prefix,
      entries: footprintLibraries.map((libraryPath) => ({
        name: `${prefix}_${path.basename(libraryPath, '.pretty')}`,
        uri: libraryPath,
        description: `Installed by KiCad Studio PCM: ${pkg.metadata.name}`
      }))
    });
  }

  private async removeManagedLibraryEntries(identifier: string): Promise<void> {
    const configDir = this.getConfigDir();
    const prefix = managedLibraryPrefix(identifier);
    for (const [fileName, rootName] of [
      ['sym-lib-table', 'sym_lib_table'],
      ['fp-lib-table', 'fp_lib_table']
    ] as const) {
      upsertLibraryTable({
        filePath: path.join(configDir, fileName),
        rootName,
        namePrefix: prefix,
        entries: []
      });
    }
  }

  private async writeKiCadInstalledPackages(): Promise<void> {
    const configDir = this.getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    const filePath = path.join(configDir, 'installed_packages.json');
    const existing = readJsonFile(filePath);
    const existingPackages = Array.isArray(existing?.['packages'])
      ? (existing['packages'] as unknown[]).filter(
          (entry) =>
            !this.managedIdentifiers.has(
              asString(asRecord(entry)?.['package'] && asRecord(asRecord(entry)?.['package'])?.['identifier']) ??
                ''
            )
        )
      : [];
    const managed = [...this.installed.values()].map((entry) => ({
      package: toKiCadPackageJson(entry.package),
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
      `${JSON.stringify({ packages: [...existingPackages, ...managed] }, null, 2)}\n`,
      'utf8'
    );
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
        isVersionNewer(
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
      .get<string[]>(SETTINGS.pcmRepositoryUrls, [
        DEFAULT_PCM_REPOSITORY_URL
      ]);
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

function readInstalledState(
  context: vscode.ExtensionContext
): PcmInstalledPackage[] {
  const value = context.globalState.get<unknown>(PCM_STATE_KEY);
  return Array.isArray(value)
    ? value.filter(isInstalledPackage)
    : [];
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

function normalizePackage(
  raw: unknown,
  repository: {
    repositoryId: string;
    repositoryName: string;
    repositoryUrl: string;
  }
): PcmPackage | undefined {
  const record = asRecord(raw);
  const identifier = asString(record?.['identifier']);
  const name = asString(record?.['name']);
  if (!record || !identifier || !name) {
    return undefined;
  }
  const versions = Array.isArray(record['versions'])
    ? record['versions']
        .map(normalizeVersion)
        .filter((version): version is PcmPackageVersion => Boolean(version))
    : [];
  const metadata: PcmPackageMetadata = {
    name,
    description: asString(record['description']) ?? '',
    descriptionFull: asString(record['description_full']) ?? '',
    identifier,
    type: asString(record['type']) ?? 'library',
    category: asString(record['category']),
    license: asString(record['license']),
    tags: readStringArray(record['tags']),
    resources: readStringRecord(record['resources']),
    versions,
    raw: record
  };
  return {
    ...repository,
    metadata,
    latestVersion: selectLatestVersion(versions),
    contentTypes: classifyPackage(metadata),
    state: 'available'
  };
}

function normalizeVersion(raw: unknown): PcmPackageVersion | undefined {
  const record = asRecord(raw);
  const version = asString(record?.['version']);
  if (!record || !version) {
    return undefined;
  }
  return {
    version,
    versionEpoch: asNumber(record['version_epoch']) ?? 0,
    downloadUrl: asString(record['download_url']),
    downloadSha256: asString(record['download_sha256']),
    status: asString(record['status']) ?? 'stable',
    kicadVersion: asString(record['kicad_version']),
    platforms: readStringArray(record['platforms'])
  };
}

function classifyPackage(metadata: PcmPackageMetadata): PcmPackageKind[] {
  const words = [
    metadata.type,
    metadata.category,
    metadata.name,
    metadata.description,
    ...metadata.tags
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  if (/\bplugin\b/u.test(words)) {
    return ['plugins'];
  }
  if (/colou?r[- ]?theme|theme|color/u.test(words)) {
    return ['color-themes'];
  }
  const kinds = new Set<PcmPackageKind>();
  if (/symbol/u.test(words)) {
    kinds.add('symbols');
  }
  if (/footprint|pretty/u.test(words)) {
    kinds.add('footprints');
  }
  if (/3d|model|step|wrl/u.test(words)) {
    kinds.add('3d-models');
  }
  if (!kinds.size) {
    kinds.add('symbols');
    kinds.add('footprints');
    kinds.add('3d-models');
  }
  return [...kinds];
}

function selectLatestVersion(
  versions: PcmPackageVersion[]
): PcmPackageVersion | undefined {
  const candidates = versions.filter((version) => version.status !== 'deprecated');
  return [...(candidates.length ? candidates : versions)].sort((left, right) =>
    compareVersions(right.version, left.version, right.versionEpoch, left.versionEpoch)
  )[0];
}

function isVersionNewer(
  candidate: string,
  current: string,
  candidateEpoch = 0,
  currentEpoch = 0
): boolean {
  return compareVersions(candidate, current, candidateEpoch, currentEpoch) > 0;
}

function compareVersions(
  left: string,
  right: string,
  leftEpoch = 0,
  rightEpoch = 0
): number {
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function scorePackageMatch(pkg: PcmPackage, query: string): number {
  const fields = [
    pkg.metadata.identifier,
    pkg.metadata.name,
    pkg.metadata.description,
    pkg.metadata.descriptionFull,
    pkg.metadata.category,
    ...pkg.metadata.tags
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  const tokens = query
    .split(/[^a-z0-9._+-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  let score = 0;
  for (const token of tokens) {
    if (fields.some((field) => field === token)) {
      score += 8;
    } else if (fields.some((field) => field.includes(token))) {
      score += 2;
    }
  }
  return score;
}

function toKiCadPackageJson(pkg: PcmPackageMetadata): Record<string, unknown> {
  return {
    ...pkg.raw,
    name: pkg.name,
    description: pkg.description,
    description_full: pkg.descriptionFull,
    identifier: pkg.identifier,
    type: pkg.type,
    ...(pkg.category ? { category: pkg.category } : {}),
    ...(pkg.license ? { license: pkg.license } : {}),
    resources: pkg.resources,
    tags: pkg.tags,
    versions: pkg.versions.map((version) => ({
      version: version.version,
      version_epoch: version.versionEpoch,
      ...(version.downloadUrl ? { download_url: version.downloadUrl } : {}),
      ...(version.downloadSha256
        ? { download_sha256: version.downloadSha256 }
        : {}),
      status: version.status,
      ...(version.kicadVersion ? { kicad_version: version.kicadVersion } : {}),
      ...(version.platforms.length ? { platforms: version.platforms } : {})
    }))
  };
}

function createRepositoryId(repositoryUrl: string): string {
  return crypto.createHash('sha256').update(repositoryUrl).digest('hex').slice(0, 16);
}

function assertSha256(bytes: Buffer, expected: string, label: string): void {
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `PCM checksum mismatch for ${label}: expected ${expected}, got ${actual}.`
    );
  }
}

function parseJsonObject(bytes: Buffer, label: string): Record<string, unknown> {
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

function managedLibraryPrefix(identifier: string): string {
  return `PCM_${sanitizeIdentifier(identifier)}`;
}

function getCommandCwd(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
}

function collectPaths(
  root: string,
  predicate: (entry: string) => boolean
): string[] {
  const results: string[] = [];
  walk(root, (entry, stat) => {
    if (stat.isFile() && predicate(entry)) {
      results.push(entry);
    }
  });
  return results;
}

function collectDirectories(
  root: string,
  predicate: (entry: string) => boolean
): string[] {
  const results: string[] = [];
  walk(root, (entry, stat) => {
    if (stat.isDirectory() && predicate(entry)) {
      results.push(entry);
    }
  });
  return results;
}

function walk(
  root: string,
  visit: (entry: string, stat: fs.Stats) => void
): void {
  if (!fs.existsSync(root)) {
    return;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    const stat = fs.statSync(fullPath);
    visit(fullPath, stat);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    }
  }
}

function upsertLibraryTable(options: {
  filePath: string;
  rootName: 'sym_lib_table' | 'fp_lib_table';
  namePrefix: string;
  entries: Array<{ name: string; uri: string; description: string }>;
}): void {
  const existing = fs.existsSync(options.filePath)
    ? fs.readFileSync(options.filePath, 'utf8')
    : `(${options.rootName}\n)\n`;
  const filteredLines = existing
    .split(/\r?\n/u)
    .filter((line) => !line.includes(`(name "${options.namePrefix}`));
  const entryLines = options.entries.map(
    (entry) =>
      `  (lib (name "${escapeTableString(entry.name)}")(type "KiCad")(uri "${escapeTableString(entry.uri)}")(options "")(descr "${escapeTableString(entry.description)}"))`
  );
  let closeIndex = -1;
  for (let index = filteredLines.length - 1; index >= 0; index -= 1) {
    if (filteredLines[index]?.trim() === ')') {
      closeIndex = index;
      break;
    }
  }
  const nextLines =
    closeIndex >= 0
      ? [
          ...filteredLines.slice(0, closeIndex),
          ...entryLines,
          ...filteredLines.slice(closeIndex)
        ]
      : [`(${options.rootName}`, ...entryLines, ')'];
  fs.mkdirSync(path.dirname(options.filePath), { recursive: true });
  fs.writeFileSync(options.filePath, `${nextLines.join('\n').trimEnd()}\n`, 'utf8');
}

function escapeTableString(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function extractZipArchive(buffer: Buffer, targetDir: string): string[] {
  const endOfCentralDirectory = findZipSignature(buffer, 0x06054b50, true);
  if (endOfCentralDirectory < 0) {
    throw new Error('PCM package archive is not a ZIP file.');
  }
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectory + 16);
  const totalEntries = buffer.readUInt16LE(endOfCentralDirectory + 10);
  const extracted: string[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('PCM package ZIP central directory is malformed.');
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString('utf8');
    offset += 46 + fileNameLength + extraLength + commentLength;

    const safeName = normalizeZipEntryName(fileName);
    if (!safeName) {
      continue;
    }
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const targetPath = path.join(targetDir, safeName);

    if (safeName.endsWith('/')) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const content =
      method === 0
        ? compressed
        : method === 8
          ? zlib.inflateRawSync(compressed)
          : undefined;
    if (!content) {
      throw new Error(`Unsupported ZIP compression method ${method}.`);
    }
    fs.writeFileSync(targetPath, content);
    extracted.push(targetPath);
  }
  return extracted;
}

function findZipSignature(
  buffer: Buffer,
  signature: number,
  reverse: boolean
): number {
  if (reverse) {
    for (let offset = buffer.length - 4; offset >= 0; offset -= 1) {
      if (buffer.readUInt32LE(offset) === signature) {
        return offset;
      }
    }
    return -1;
  }
  for (let offset = 0; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  return -1;
}

function normalizeZipEntryName(fileName: string): string | undefined {
  const normalized = fileName.replace(/\\/gu, '/').replace(/^\/+/u, '');
  if (
    !normalized ||
    path.isAbsolute(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    return undefined;
  }
  return normalized;
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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );
}
