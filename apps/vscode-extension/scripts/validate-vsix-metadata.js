#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const EXPECTED_PUBLISHER = 'oaslananka';
const EXPECTED_NAME = 'kicadstudiokit';
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_HEADER_SIZE = 30;
const ZIP_LOCAL_HEADER_NAME_LENGTH_OFFSET = 26;
const ZIP_LOCAL_HEADER_EXTRA_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_HEADER_SIZE = 46;
const ZIP_CENTRAL_METHOD_OFFSET = 10;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const ZIP_CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_END_HEADER_SIZE = 22;
const ZIP_MAX_COMMENT_LENGTH = 0xffff;
const ZIP_END_ENTRY_COUNT_OFFSET = 10;
const ZIP_END_CENTRAL_OFFSET_OFFSET = 16;

function validateVsixMetadata(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const pkg = options.packageJson ?? readJson(path.join(root, 'package.json'));
  const vsixPath = path.resolve(
    options.vsixPath ?? path.join(root, `${pkg.name}-${pkg.version}.vsix`)
  );
  const vsixPackage = readVsixPackageJson(vsixPath);
  const failures = [];

  expectIdentity(pkg, 'package.json', failures);
  expectIdentity(vsixPackage, `VSIX ${path.basename(vsixPath)}`, failures);
  if (path.basename(vsixPath) !== `${pkg.name}-${pkg.version}.vsix`) {
    failures.push(
      `VSIX filename must be ${pkg.name}-${pkg.version}.vsix, found ${path.basename(vsixPath)}`
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `VSIX metadata validation failed:\n- ${failures.join('\n- ')}`
    );
  }

  return {
    extensionId: `${vsixPackage.publisher}.${vsixPackage.name}`,
    version: vsixPackage.version,
    vsixPath
  };
}

function expectIdentity(pkg, label, failures) {
  if (pkg.publisher !== EXPECTED_PUBLISHER) {
    failures.push(`${label} publisher must be ${EXPECTED_PUBLISHER}`);
  }
  if (pkg.name !== EXPECTED_NAME) {
    failures.push(`${label} name must be ${EXPECTED_NAME}`);
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    failures.push(`${label} version must be a non-empty string`);
  }
}

function readVsixPackageJson(vsixPath) {
  if (!fs.existsSync(vsixPath)) {
    throw new Error(`Missing VSIX artifact: ${vsixPath}`);
  }
  const entry = readZipEntry(vsixPath, 'extension/package.json');
  return JSON.parse(entry.toString('utf8'));
}

function readZipEntry(zipPath, entryName) {
  const buffer = fs.readFileSync(zipPath);
  const entry = findCentralDirectoryEntry(buffer, entryName);
  const localOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP local header for ${entryName}`);
  }
  const nameLength = buffer.readUInt16LE(
    localOffset + ZIP_LOCAL_HEADER_NAME_LENGTH_OFFSET
  );
  const extraLength = buffer.readUInt16LE(
    localOffset + ZIP_LOCAL_HEADER_EXTRA_LENGTH_OFFSET
  );
  const dataOffset =
    localOffset + ZIP_LOCAL_HEADER_SIZE + nameLength + extraLength;
  const compressed = buffer.subarray(
    dataOffset,
    dataOffset + entry.compressedSize
  );

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error(
    `Unsupported ZIP compression method ${entry.compressionMethod}`
  );
}

function findCentralDirectoryEntry(buffer, entryName) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(
    endOffset + ZIP_END_ENTRY_COUNT_OFFSET
  );
  let offset = buffer.readUInt32LE(endOffset + ZIP_END_CENTRAL_OFFSET_OFFSET);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error('Invalid ZIP central directory header');
    }
    const nameLength = buffer.readUInt16LE(
      offset + ZIP_CENTRAL_NAME_LENGTH_OFFSET
    );
    const extraLength = buffer.readUInt16LE(
      offset + ZIP_CENTRAL_EXTRA_LENGTH_OFFSET
    );
    const commentLength = buffer.readUInt16LE(
      offset + ZIP_CENTRAL_COMMENT_LENGTH_OFFSET
    );
    const name = buffer
      .subarray(
        offset + ZIP_CENTRAL_HEADER_SIZE,
        offset + ZIP_CENTRAL_HEADER_SIZE + nameLength
      )
      .toString();
    if (name === entryName) return centralDirectoryEntry(buffer, offset);
    offset +=
      ZIP_CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }
  throw new Error(`Missing ZIP entry: ${entryName}`);
}

function centralDirectoryEntry(buffer, offset) {
  return {
    compressionMethod: buffer.readUInt16LE(offset + ZIP_CENTRAL_METHOD_OFFSET),
    compressedSize: buffer.readUInt32LE(
      offset + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET
    ),
    localHeaderOffset: buffer.readUInt32LE(
      offset + ZIP_CENTRAL_LOCAL_HEADER_OFFSET
    )
  };
}

function findEndOfCentralDirectory(buffer) {
  const firstPossibleOffset = Math.max(
    0,
    buffer.length - ZIP_MAX_COMMENT_LENGTH - ZIP_END_HEADER_SIZE
  );
  for (
    let offset = buffer.length - ZIP_END_HEADER_SIZE;
    offset >= firstPossibleOffset;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE)
      return offset;
  }
  throw new Error('Unable to find ZIP end of central directory');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

if (require.main === module) {
  try {
    const result = validateVsixMetadata({ vsixPath: process.argv[2] });
    console.log(
      `VSIX metadata validation passed: ${result.extensionId}@${result.version}`
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  readZipEntry,
  validateVsixMetadata
};
