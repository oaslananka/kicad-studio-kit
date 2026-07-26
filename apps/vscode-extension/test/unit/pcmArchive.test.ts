import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {
  assertPcmSha256,
  extractPcmZipArchive
} from '../../src/library/pcmArchive';

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-pcm-archive-'));
}

function createZip(options: {
  name: string;
  data: Buffer;
  method?: 0 | 8;
}): Buffer {
  const method = options.method ?? 0;
  const name = Buffer.from(options.name, 'utf8');
  const compressed =
    method === 8 ? zlib.deflateRawSync(options.data) : options.data;

  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(options.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(options.data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  name.copy(central, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length + compressed.length, 16);

  return Buffer.concat([local, compressed, central, end]);
}

function centralDirectoryOffset(buffer: Buffer): number {
  return buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
}

describe('PCM archive boundary (#497)', () => {
  it('accepts matching SHA-256 digests case-insensitively', () => {
    const bytes = Buffer.from('verified archive');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');

    expect(() =>
      assertPcmSha256(bytes, digest.toUpperCase(), 'fixture')
    ).not.toThrow();
  });

  it('rejects checksum mismatches with actionable context', () => {
    expect(() =>
      assertPcmSha256(Buffer.from('archive'), '0'.repeat(64), 'fixture.zip')
    ).toThrow(/checksum mismatch.*fixture\.zip/i);
  });

  it.each([
    ['stored', 0 as const],
    ['deflate', 8 as const]
  ])(
    'extracts %s ZIP entries inside the target directory',
    (_label, method) => {
      const root = tempRoot();
      const target = path.join(root, 'target');
      const archive = createZip({
        name: 'symbols/Fixture.kicad_sym',
        data: Buffer.from('(kicad_symbol_lib)\n'),
        method
      });

      const extracted = extractPcmZipArchive(archive, target);
      const expected = path.join(target, 'symbols', 'Fixture.kicad_sym');

      expect(extracted).toEqual([expected]);
      expect(fs.readFileSync(expected, 'utf8')).toBe('(kicad_symbol_lib)\n');
    }
  );

  it('creates directory entries without reporting them as extracted files', () => {
    const root = tempRoot();
    const target = path.join(root, 'target');
    const archive = createZip({
      name: 'symbols/',
      data: Buffer.alloc(0)
    });

    expect(extractPcmZipArchive(archive, target)).toEqual([]);
    expect(fs.statSync(path.join(target, 'symbols')).isDirectory()).toBe(true);
  });

  it('rejects non-ZIP and malformed central-directory inputs', () => {
    expect(() =>
      extractPcmZipArchive(Buffer.from('not a zip'), tempRoot())
    ).toThrow(/not a zip/i);

    const malformed = createZip({
      name: 'Fixture.kicad_sym',
      data: Buffer.from('fixture')
    });
    malformed.writeUInt32LE(0, centralDirectoryOffset(malformed));
    expect(() => extractPcmZipArchive(malformed, tempRoot())).toThrow(
      /central directory is malformed/i
    );
  });

  it('rejects unsupported ZIP compression methods', () => {
    const archive = createZip({
      name: 'Fixture.kicad_sym',
      data: Buffer.from('fixture')
    });
    archive.writeUInt16LE(99, centralDirectoryOffset(archive) + 10);

    expect(() => extractPcmZipArchive(archive, tempRoot())).toThrow(
      /unsupported zip compression method 99/i
    );
  });

  it.each(['../x.txt', '..\\x.txt'])(
    'skips traversal entry %s without writing outside the target',
    (entryName) => {
      const root = tempRoot();
      const target = path.join(root, 'target');
      const archive = createZip({
        name: entryName,
        data: Buffer.from('escape')
      });

      expect(extractPcmZipArchive(archive, target)).toEqual([]);
      expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false);
    }
  );
});
