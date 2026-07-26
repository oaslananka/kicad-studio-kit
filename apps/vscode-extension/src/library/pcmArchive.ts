import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

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
  targetDir: string
): string[] {
  const endOfCentralDirectory = findLastZipSignature(buffer, 0x06054b50);
  if (endOfCentralDirectory < 0) {
    throw new Error('PCM package archive is not a ZIP file.');
  }
  const centralDirectoryOffset = buffer.readUInt32LE(
    endOfCentralDirectory + 16
  );
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
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
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

function findLastZipSignature(buffer: Buffer, signature: number): number {
  for (let offset = buffer.length - 4; offset >= 0; offset -= 1) {
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
