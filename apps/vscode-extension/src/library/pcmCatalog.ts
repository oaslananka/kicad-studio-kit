export type PcmPackageKind =
  | 'symbols'
  | 'footprints'
  | '3d-models'
  | 'plugins'
  | 'color-themes';

export type PcmInstallState = 'available' | 'installed' | 'update-available';

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

export function normalizePcmPackage(
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
        .map(normalizePcmVersion)
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
    latestVersion: selectLatestPcmVersion(versions),
    contentTypes: classifyPcmPackage(metadata),
    state: 'available'
  };
}

function normalizePcmVersion(raw: unknown): PcmPackageVersion | undefined {
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

export function classifyPcmPackage(
  metadata: PcmPackageMetadata
): PcmPackageKind[] {
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

function selectLatestPcmVersion(
  versions: PcmPackageVersion[]
): PcmPackageVersion | undefined {
  const candidates = versions.filter(
    (version) => version.status !== 'deprecated'
  );
  return [...(candidates.length ? candidates : versions)].sort((left, right) =>
    comparePcmVersions(
      right.version,
      left.version,
      right.versionEpoch,
      left.versionEpoch
    )
  )[0];
}

export function isPcmVersionNewer(
  candidate: string,
  current: string,
  candidateEpoch = 0,
  currentEpoch = 0
): boolean {
  return (
    comparePcmVersions(candidate, current, candidateEpoch, currentEpoch) > 0
  );
}

export function comparePcmVersions(
  left: string,
  right: string,
  leftEpoch = 0,
  rightEpoch = 0
): number {
  if (leftEpoch !== rightEpoch) {
    return leftEpoch - rightEpoch;
  }
  const leftParts = left
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export function scorePcmPackageMatch(pkg: PcmPackage, query: string): number {
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

export function toKiCadPcmPackageJson(
  pkg: PcmPackageMetadata
): Record<string, unknown> {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
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
