import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  compareVsixContent,
  readZipEntry,
  validateVsixMetadata
} = require('./validate-vsix-metadata.js');

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_VERSION_NEEDED = 20;
const ZIP_LOCAL_HEADER_SIZE = 30;
const ZIP_CENTRAL_HEADER_SIZE = 46;
const ZIP_END_HEADER_SIZE = 22;
const ZIP_HEADER_VERSION_OFFSET = 4;
const ZIP_HEADER_REQUIRED_VERSION_OFFSET = 6;
const ZIP_LOCAL_COMPRESSED_SIZE_OFFSET = 18;
const ZIP_LOCAL_UNCOMPRESSED_SIZE_OFFSET = 22;
const ZIP_LOCAL_NAME_LENGTH_OFFSET = 26;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;
const ZIP_CENTRAL_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_END_DISK_ENTRY_COUNT_OFFSET = 8;
const ZIP_END_ENTRY_COUNT_OFFSET = 10;
const ZIP_END_CENTRAL_SIZE_OFFSET = 12;
const ZIP_END_CENTRAL_OFFSET_OFFSET = 16;

test('validateVsixMetadata accepts the packaged extension identity', () => {
  withFixtureVsix(
    {
      publisher: 'oaslananka',
      name: 'kicadstudiokit',
      version: '1.0.0'
    },
    ({ root, vsixPath, packageJson }) => {
      const result = validateVsixMetadata({ root, vsixPath, packageJson });

      assert.equal(result.extensionId, 'oaslananka.kicadstudiokit');
      assert.equal(result.version, '1.0.0');
    }
  );
});

test('validateVsixMetadata rejects the deleted Marketplace identity', () => {
  withFixtureVsix(
    {
      publisher: 'oaslananka',
      name: 'kicadstudio',
      version: '1.0.0'
    },
    ({ root, vsixPath, packageJson }) => {
      assert.throws(
        () => validateVsixMetadata({ root, vsixPath, packageJson }),
        /VSIX kicadstudiokit-1\.0\.0\.vsix name must be kicadstudiokit/
      );
    }
  );
});

test('readZipEntry extracts a stored VSIX package manifest', () => {
  withFixtureVsix(
    {
      publisher: 'oaslananka',
      name: 'kicadstudiokit',
      version: '1.0.0'
    },
    ({ vsixPath }) => {
      const entry = JSON.parse(
        readZipEntry(vsixPath, 'extension/package.json')
      );

      assert.equal(entry.publisher, 'oaslananka');
      assert.equal(entry.name, 'kicadstudiokit');
    }
  );
});

test('#344 compareVsixContent ignores mutable ZIP container metadata', () => {
  withFixtureVsix(
    {
      publisher: 'oaslananka',
      name: 'kicadstudiokit',
      version: '1.0.0'
    },
    ({ root, vsixPath }) => {
      const registryPath = path.join(root, 'registry.vsix');
      const registryArchive = Buffer.from(fs.readFileSync(vsixPath));
      registryArchive.writeUInt16LE(0x1234, 10);
      fs.writeFileSync(registryPath, registryArchive);

      assert.notDeepEqual(
        fs.readFileSync(vsixPath),
        fs.readFileSync(registryPath)
      );
      const result = compareVsixContent(vsixPath, registryPath);
      assert.equal(result.entryCount, 1);
      assert.match(result.contentDigest, /^[a-f0-9]{64}$/);
    }
  );
});

test('#344 compareVsixContent rejects registry payload changes', () => {
  withFixtureVsix(
    {
      publisher: 'oaslananka',
      name: 'kicadstudiokit',
      version: '1.0.0'
    },
    ({ root, vsixPath }) => {
      const registryPath = path.join(root, 'registry.vsix');
      fs.writeFileSync(
        registryPath,
        createStoredZip({
          'extension/package.json': JSON.stringify({
            publisher: 'oaslananka',
            name: 'kicadstudiokit',
            version: '1.0.1'
          })
        })
      );

      assert.throws(
        () => compareVsixContent(vsixPath, registryPath),
        /changed entries: extension\/package\.json/
      );
    }
  );
});

function withFixtureVsix(extensionPackage, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kicad-vsix-'));
  try {
    const packageJson = {
      publisher: 'oaslananka',
      name: 'kicadstudiokit',
      version: '1.0.0'
    };
    const vsixPath = path.join(root, 'kicadstudiokit-1.0.0.vsix');
    fs.writeFileSync(
      vsixPath,
      createStoredZip({
        'extension/package.json': JSON.stringify(extensionPackage)
      })
    );
    callback({ root, vsixPath, packageJson });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(value);
    localParts.push(localHeader(nameBuffer, data), nameBuffer, data);
    centralParts.push(centralHeader(nameBuffer, data, localOffset), nameBuffer);
    localOffset += ZIP_LOCAL_HEADER_SIZE + nameBuffer.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    centralDirectory,
    endOfCentralDirectory(
      Object.keys(entries).length,
      centralDirectory.length,
      localOffset
    )
  ]);
}

function localHeader(name, data) {
  const header = Buffer.alloc(ZIP_LOCAL_HEADER_SIZE);
  header.writeUInt32LE(ZIP_LOCAL_FILE_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, ZIP_HEADER_VERSION_OFFSET);
  header.writeUInt32LE(data.length, ZIP_LOCAL_COMPRESSED_SIZE_OFFSET);
  header.writeUInt32LE(data.length, ZIP_LOCAL_UNCOMPRESSED_SIZE_OFFSET);
  header.writeUInt16LE(name.length, ZIP_LOCAL_NAME_LENGTH_OFFSET);
  return header;
}

function centralHeader(name, data, localOffset) {
  const header = Buffer.alloc(ZIP_CENTRAL_HEADER_SIZE);
  header.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, ZIP_HEADER_VERSION_OFFSET);
  header.writeUInt16LE(ZIP_VERSION_NEEDED, ZIP_HEADER_REQUIRED_VERSION_OFFSET);
  header.writeUInt32LE(data.length, ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
  header.writeUInt32LE(data.length, ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET);
  header.writeUInt16LE(name.length, ZIP_CENTRAL_NAME_LENGTH_OFFSET);
  header.writeUInt32LE(localOffset, ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
  return header;
}

function endOfCentralDirectory(entryCount, size, offset) {
  const footer = Buffer.alloc(ZIP_END_HEADER_SIZE);
  footer.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  footer.writeUInt16LE(entryCount, ZIP_END_DISK_ENTRY_COUNT_OFFSET);
  footer.writeUInt16LE(entryCount, ZIP_END_ENTRY_COUNT_OFFSET);
  footer.writeUInt32LE(size, ZIP_END_CENTRAL_SIZE_OFFSET);
  footer.writeUInt32LE(offset, ZIP_END_CENTRAL_OFFSET_OFFSET);
  return footer;
}
