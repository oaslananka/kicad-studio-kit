import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

export interface PcmArchiveLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
}

export const DEFAULT_PCM_ARCHIVE_LIMITS: Readonly<PcmArchiveLimits> =
  Object.freeze({
    maxArchiveBytes: 512 * 1024 * 1024,
    maxEntries: 25_000,
    maxEntryUncompressedBytes: 512 * 1024 * 1024,
    maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024
  });

interface ParsedZipEntry {
  name: string;
  safeName: string | undefined;
  method: number;
  compressedOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
}

interface ParsedZipArchive {
  entries: ParsedZipEntry[];
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const ZIP64_U16 = 0xffff;
const ZIP64_U32 = 0xffffffff;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_STRONG_ENCRYPTION = 0x0040;
const EOCD_FIXED_BYTES = 22;
const CENTRAL_FIXED_BYTES = 46;
const LOCAL_FIXED_BYTES = 30;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export function assertPcmSha256(
  bytes: Buffer,
  expected: string,
  label: string
): void {
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected.toLowerCase()) {
    throw new Error(
      `PCM checksum mismatch for ${label}: expected ${expected}, got ${actual}.`
    );
  }
}

export function extractPcmZipArchive(
  buffer: Buffer,
  targetDir: string,
  limits: PcmArchiveLimits = DEFAULT_PCM_ARCHIVE_LIMITS
): string[] {
  validateLimits(limits);
  if (buffer.length > limits.maxArchiveBytes) {
    throw new Error(
      `PCM ZIP archive exceeds maximum archive size of ${limits.maxArchiveBytes} bytes.`
    );
  }

  const archive = parseZipArchive(buffer, limits);
  return extractToStagingAndPublish(buffer, archive, targetDir, limits);
}

function parseZipArchive(
  buffer: Buffer,
  limits: PcmArchiveLimits
): ParsedZipArchive {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  assertRange(
    buffer.length,
    eocdOffset,
    EOCD_FIXED_BYTES,
    'PCM ZIP end of central directory is truncated'
  );

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDiskNumber = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);

  if (
    entriesOnDisk === ZIP64_U16 ||
    totalEntries === ZIP64_U16 ||
    centralDirectorySize === ZIP64_U32 ||
    centralDirectoryOffset === ZIP64_U32
  ) {
    throw new Error('PCM ZIP64 archives are not supported.');
  }
  if (
    diskNumber !== 0 ||
    centralDiskNumber !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    throw new Error('PCM multi-disk ZIP archives are not supported.');
  }
  if (totalEntries > limits.maxEntries) {
    throw new Error(
      `PCM ZIP entry count ${totalEntries} exceeds maximum ${limits.maxEntries}.`
    );
  }
  assertRange(
    buffer.length,
    eocdOffset + EOCD_FIXED_BYTES,
    commentLength,
    'PCM ZIP end-of-central-directory comment exceeds archive bounds'
  );

  const centralDirectoryEnd = checkedEnd(
    centralDirectoryOffset,
    centralDirectorySize,
    buffer.length,
    'PCM ZIP central directory exceeds archive bounds'
  );
  if (centralDirectoryEnd !== eocdOffset) {
    throw new Error(
      'PCM ZIP central directory must end at the end-of-central-directory record.'
    );
  }

  const entries: ParsedZipEntry[] = [];
  const extractedNames = new Set<string>();
  let totalUncompressedBytes = 0;
  let centralOffset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    assertRange(
      centralDirectoryEnd,
      centralOffset,
      CENTRAL_FIXED_BYTES,
      'PCM ZIP central directory entry exceeds archive bounds'
    );
    if (buffer.readUInt32LE(centralOffset) !== CENTRAL_SIGNATURE) {
      throw new Error('PCM package ZIP central directory is malformed.');
    }

    const centralFlags = buffer.readUInt16LE(centralOffset + 8);
    const method = buffer.readUInt16LE(centralOffset + 10);
    const compressedSize = buffer.readUInt32LE(centralOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(centralOffset + 24);
    const fileNameLength = buffer.readUInt16LE(centralOffset + 28);
    const extraLength = buffer.readUInt16LE(centralOffset + 30);
    const commentLengthForEntry = buffer.readUInt16LE(centralOffset + 32);
    const diskStart = buffer.readUInt16LE(centralOffset + 34);
    const localHeaderOffset = buffer.readUInt32LE(centralOffset + 42);

    if (
      compressedSize === ZIP64_U32 ||
      uncompressedSize === ZIP64_U32 ||
      localHeaderOffset === ZIP64_U32
    ) {
      throw new Error('PCM ZIP64 archives are not supported.');
    }
    if (diskStart !== 0) {
      throw new Error('PCM multi-disk ZIP archives are not supported.');
    }
    validateFlags(centralFlags);
    validateMethod(method);

    const variableLength = checkedAdd(
      checkedAdd(
        fileNameLength,
        extraLength,
        'PCM ZIP central directory entry length is invalid'
      ),
      commentLengthForEntry,
      'PCM ZIP central directory entry length is invalid'
    );
    const entryEnd = checkedEnd(
      centralOffset + CENTRAL_FIXED_BYTES,
      variableLength,
      centralDirectoryEnd,
      'PCM ZIP central directory entry exceeds archive bounds'
    );
    const fileNameStart = centralOffset + CENTRAL_FIXED_BYTES;
    const extraStart = fileNameStart + fileNameLength;
    const fileNameBytes = buffer.subarray(
      fileNameStart,
      fileNameStart + fileNameLength
    );
    const extraBytes = buffer.subarray(extraStart, extraStart + extraLength);
    if (containsZip64Extra(extraBytes)) {
      throw new Error('PCM ZIP64 archives are not supported.');
    }

    if (uncompressedSize > limits.maxEntryUncompressedBytes) {
      throw new Error(
        `PCM ZIP entry uncompressed size ${uncompressedSize} exceeds maximum ${limits.maxEntryUncompressedBytes}.`
      );
    }
    totalUncompressedBytes = checkedAdd(
      totalUncompressedBytes,
      uncompressedSize,
      'PCM ZIP total uncompressed size is invalid'
    );
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new Error(
        `PCM ZIP total uncompressed size ${totalUncompressedBytes} exceeds maximum ${limits.maxTotalUncompressedBytes}.`
      );
    }

    const local = parseLocalHeader({
      buffer,
      centralDirectoryOffset,
      localHeaderOffset,
      centralFlags,
      method,
      compressedSize,
      uncompressedSize,
      centralFileName: fileNameBytes
    });
    const name = fileNameBytes.toString('utf8');
    const safeName = normalizeZipEntryName(name);
    const directory = Boolean(safeName?.endsWith('/'));
    if (directory && (compressedSize !== 0 || uncompressedSize !== 0)) {
      throw new Error(`PCM ZIP directory entry ${name} must have zero sizes.`);
    }
    if (safeName) {
      const duplicateKey = safeName.replace(/\/+$/u, '');
      if (extractedNames.has(duplicateKey)) {
        throw new Error(`PCM ZIP contains duplicate entry ${safeName}.`);
      }
      extractedNames.add(duplicateKey);
    }

    entries.push({
      name,
      safeName,
      method,
      compressedOffset: local.compressedOffset,
      compressedSize,
      uncompressedSize,
      directory
    });
    centralOffset = entryEnd;
  }

  if (centralOffset !== centralDirectoryEnd) {
    throw new Error(
      'PCM ZIP central directory size does not match its entries.'
    );
  }
  return { entries };
}

function parseLocalHeader(options: {
  buffer: Buffer;
  centralDirectoryOffset: number;
  localHeaderOffset: number;
  centralFlags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  centralFileName: Buffer;
}): { compressedOffset: number } {
  const {
    buffer,
    centralDirectoryOffset,
    localHeaderOffset,
    centralFlags,
    method,
    compressedSize,
    uncompressedSize,
    centralFileName
  } = options;
  assertRange(
    centralDirectoryOffset,
    localHeaderOffset,
    LOCAL_FIXED_BYTES,
    'PCM ZIP local header exceeds archive bounds'
  );
  if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE) {
    throw new Error('PCM ZIP local header is malformed.');
  }

  const localFlags = buffer.readUInt16LE(localHeaderOffset + 6);
  const localMethod = buffer.readUInt16LE(localHeaderOffset + 8);
  const localCompressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
  const localUncompressedSize = buffer.readUInt32LE(localHeaderOffset + 22);
  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);

  validateFlags(localFlags);
  if (centralFlags !== localFlags) {
    throw new Error('PCM ZIP central and local flags do not match.');
  }
  if (method !== localMethod) {
    throw new Error(
      'PCM ZIP central and local compression method do not match.'
    );
  }
  if (
    compressedSize !== localCompressedSize ||
    uncompressedSize !== localUncompressedSize
  ) {
    throw new Error('PCM ZIP central and local entry sizes do not match.');
  }
  if (method === 0 && compressedSize !== uncompressedSize) {
    throw new Error('PCM ZIP stored entry sizes do not match.');
  }

  const localVariableLength = checkedAdd(
    localNameLength,
    localExtraLength,
    'PCM ZIP local header length is invalid'
  );
  const compressedOffset = checkedEnd(
    localHeaderOffset + LOCAL_FIXED_BYTES,
    localVariableLength,
    centralDirectoryOffset,
    'PCM ZIP local header exceeds archive bounds'
  );
  checkedEnd(
    compressedOffset,
    compressedSize,
    centralDirectoryOffset,
    'PCM ZIP compressed data exceeds archive bounds'
  );
  const localName = buffer.subarray(
    localHeaderOffset + LOCAL_FIXED_BYTES,
    localHeaderOffset + LOCAL_FIXED_BYTES + localNameLength
  );
  if (!localName.equals(centralFileName)) {
    throw new Error('PCM ZIP central and local entry names do not match.');
  }
  const localExtra = buffer.subarray(
    localHeaderOffset + LOCAL_FIXED_BYTES + localNameLength,
    compressedOffset
  );
  if (containsZip64Extra(localExtra)) {
    throw new Error('PCM ZIP64 archives are not supported.');
  }
  return { compressedOffset };
}

function extractToStagingAndPublish(
  buffer: Buffer,
  archive: ParsedZipArchive,
  targetDir: string,
  limits: PcmArchiveLimits
): string[] {
  const targetRoot = path.resolve(targetDir);
  const parentDir = path.dirname(targetRoot);
  const targetName = path.basename(targetRoot);
  fs.mkdirSync(parentDir, { recursive: true });
  const stagingRoot = fs.mkdtempSync(
    path.join(parentDir, `.${targetName}.pcm-stage-`)
  );
  const extractedNames: string[] = [];

  try {
    for (const entry of archive.entries) {
      if (!entry.safeName) {
        continue;
      }
      const stagingPath = resolveInside(stagingRoot, entry.safeName);
      if (entry.directory) {
        fs.mkdirSync(stagingPath, { recursive: true });
        continue;
      }

      const compressed = buffer.subarray(
        entry.compressedOffset,
        entry.compressedOffset + entry.compressedSize
      );
      const content = decompressEntry(entry, compressed, limits);
      fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
      fs.writeFileSync(stagingPath, content);
      extractedNames.push(entry.safeName);
    }

    publishStagingDirectory(stagingRoot, targetRoot);
    return extractedNames.map((name) => path.join(targetRoot, name));
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function decompressEntry(
  entry: ParsedZipEntry,
  compressed: Buffer,
  limits: PcmArchiveLimits
): Buffer {
  if (entry.method === 0) {
    if (compressed.length !== entry.uncompressedSize) {
      throw new Error(
        `PCM ZIP stored entry sizes do not match for ${entry.name}.`
      );
    }
    return compressed;
  }

  const maxOutputLength = Math.min(
    entry.uncompressedSize + 1,
    limits.maxEntryUncompressedBytes + 1
  );
  let content: Buffer;
  try {
    content = zlib.inflateRawSync(compressed, { maxOutputLength });
  } catch (error) {
    if (isOutputLimitError(error)) {
      throw new Error(
        `PCM ZIP entry ${entry.name} exceeds declared uncompressed size or configured limit.`,
        { cause: error }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PCM ZIP entry ${entry.name} could not be decompressed: ${message}`,
      { cause: error }
    );
  }
  if (content.length !== entry.uncompressedSize) {
    throw new Error(
      `PCM ZIP decompressed size ${content.length} does not match declared size ${entry.uncompressedSize} for ${entry.name}.`
    );
  }
  return content;
}

function publishStagingDirectory(
  stagingRoot: string,
  targetRoot: string
): void {
  let backupPath: string | undefined;
  if (fs.existsSync(targetRoot)) {
    backupPath = `${targetRoot}.pcm-backup-${crypto.randomUUID()}`;
    fs.renameSync(targetRoot, backupPath);
  }
  try {
    fs.renameSync(stagingRoot, targetRoot);
    if (backupPath) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
  } catch (error) {
    if (!fs.existsSync(targetRoot) && backupPath && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, targetRoot);
    }
    throw error;
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumOffset = Math.max(
    0,
    buffer.length - EOCD_FIXED_BYTES - MAX_ZIP_COMMENT_BYTES
  );
  const validCandidates: number[] = [];
  const fallbackCandidates: number[] = [];
  let sawTruncatedSignature = false;
  let sawOutOfBoundsComment = false;

  for (let offset = minimumOffset; offset <= buffer.length - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) {
      continue;
    }
    if (offset + EOCD_FIXED_BYTES > buffer.length) {
      sawTruncatedSignature = true;
      continue;
    }
    const commentLength = buffer.readUInt16LE(offset + 20);
    const recordEnd = offset + EOCD_FIXED_BYTES + commentLength;
    if (recordEnd > buffer.length) {
      sawOutOfBoundsComment = true;
      continue;
    }
    if (recordEnd !== buffer.length) {
      continue;
    }

    fallbackCandidates.push(offset);
    const centralDirectorySize = buffer.readUInt32LE(offset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(offset + 16);
    if (centralDirectoryOffset + centralDirectorySize === offset) {
      validCandidates.push(offset);
    }
  }

  if (validCandidates.length > 1) {
    throw new Error(
      'PCM ZIP contains multiple valid end-of-central-directory records.'
    );
  }
  if (validCandidates.length === 1) {
    return validCandidates[0]!;
  }
  if (fallbackCandidates.length > 1) {
    throw new Error(
      'PCM ZIP contains multiple end-of-central-directory records.'
    );
  }
  if (fallbackCandidates.length === 1) {
    return fallbackCandidates[0]!;
  }
  if (sawTruncatedSignature) {
    throw new Error('PCM ZIP end of central directory is truncated.');
  }
  if (sawOutOfBoundsComment) {
    throw new Error(
      'PCM ZIP end-of-central-directory comment exceeds archive bounds.'
    );
  }
  throw new Error('PCM package archive is not a ZIP file.');
}

function validateFlags(flags: number): void {
  if ((flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) !== 0) {
    throw new Error('PCM ZIP encrypted entries are not supported.');
  }
  if ((flags & FLAG_DATA_DESCRIPTOR) !== 0) {
    throw new Error('PCM ZIP data descriptors are not supported.');
  }
}

function validateMethod(method: number): void {
  if (method !== 0 && method !== 8) {
    throw new Error(`Unsupported ZIP compression method ${method}.`);
  }
}

function containsZip64Extra(extra: Buffer): boolean {
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const headerId = extra.readUInt16LE(offset);
    const dataSize = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + dataSize > extra.length) {
      throw new Error('PCM ZIP extra field exceeds archive bounds.');
    }
    if (headerId === ZIP64_EXTRA_ID) {
      return true;
    }
    offset += dataSize;
  }
  if (offset !== extra.length) {
    throw new Error('PCM ZIP extra field exceeds archive bounds.');
  }
  return false;
}

function normalizeZipEntryName(fileName: string): string | undefined {
  if (fileName.includes('\0')) {
    return undefined;
  }
  const normalized = fileName.replace(/\\/gu, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized)
  ) {
    return undefined;
  }
  const directory = normalized.endsWith('/');
  const parts = normalized
    .split('/')
    .filter((part) => part.length > 0 && part !== '.');
  if (parts.some((part) => part === '..')) {
    return undefined;
  }
  const safeName = parts.join('/');
  return safeName ? `${safeName}${directory ? '/' : ''}` : undefined;
}

function resolveInside(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`PCM ZIP entry escapes extraction root: ${relativePath}.`);
  }
  return resolved;
}

function validateLimits(limits: PcmArchiveLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`PCM ZIP limit ${name} must be a positive safe integer.`);
    }
  }
}

function assertRange(
  boundary: number,
  offset: number,
  length: number,
  message: string
): void {
  checkedEnd(offset, length, boundary, message);
}

function checkedEnd(
  offset: number,
  length: number,
  boundary: number,
  message: string
): number {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset > boundary ||
    length > boundary - offset
  ) {
    throw new Error(`${message}.`);
  }
  return offset + length;
}

function checkedAdd(left: number, right: number, message: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${message}.`);
  }
  return result;
}

function isOutputLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; name?: unknown };
  return (
    candidate.name === 'RangeError' || candidate.code === 'ERR_BUFFER_TOO_LARGE'
  );
}
