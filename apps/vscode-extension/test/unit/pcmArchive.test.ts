import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {
  DEFAULT_PCM_ARCHIVE_LIMITS,
  assertPcmSha256,
  extractPcmZipArchive,
  type PcmArchiveLimits
} from '../../src/library/pcmArchive';

interface ZipEntrySpec {
  name: string;
  data: Buffer;
  method?: number;
  flags?: number;
  centralMethod?: number;
  localMethod?: number;
  centralFlags?: number;
  localFlags?: number;
  centralCompressedSize?: number;
  centralUncompressedSize?: number;
  localCompressedSize?: number;
  localUncompressedSize?: number;
}

const EOCD_BYTES = 22;

interface BuiltZip {
  buffer: Buffer;
  centralOffsets: number[];
  localOffsets: number[];
  eocdOffset: number;
}

function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kicadstudio-pcm-archive-'));
}

function createZip(
  entries: ZipEntrySpec[],
  options: {
    diskNumber?: number;
    centralDiskNumber?: number;
    entriesOnDisk?: number;
    totalEntries?: number;
    centralDirectorySize?: number;
    centralDirectoryOffset?: number;
    comment?: Buffer;
  } = {}
): BuiltZip {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const localOffsets: number[] = [];
  const relativeCentralOffsets: number[] = [];
  let localCursor = 0;
  let centralCursor = 0;

  for (const entry of entries) {
    const method = entry.method ?? 0;
    const localMethod = entry.localMethod ?? method;
    const centralMethod = entry.centralMethod ?? method;
    const flags = entry.flags ?? 0x0800;
    const localFlags = entry.localFlags ?? flags;
    const centralFlags = entry.centralFlags ?? flags;
    const name = Buffer.from(entry.name, 'utf8');
    const compressed =
      method === 8 ? zlib.deflateRawSync(entry.data) : entry.data;
    const localCompressedSize = entry.localCompressedSize ?? compressed.length;
    const localUncompressedSize =
      entry.localUncompressedSize ?? entry.data.length;
    const centralCompressedSize =
      entry.centralCompressedSize ?? compressed.length;
    const centralUncompressedSize =
      entry.centralUncompressedSize ?? entry.data.length;

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(localFlags, 6);
    local.writeUInt16LE(localMethod, 8);
    local.writeUInt32LE(localCompressedSize, 18);
    local.writeUInt32LE(localUncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localOffsets.push(localCursor);
    localParts.push(local, compressed);
    localCursor += local.length + compressed.length;

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(centralFlags, 8);
    central.writeUInt16LE(centralMethod, 10);
    central.writeUInt32LE(centralCompressedSize, 20);
    central.writeUInt32LE(centralUncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffsets.at(-1) ?? 0, 42);
    name.copy(central, 46);
    relativeCentralOffsets.push(centralCursor);
    centralParts.push(central);
    centralCursor += central.length;
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const centralDirectoryOffset =
    options.centralDirectoryOffset ?? localSection.length;
  const comment = options.comment ?? Buffer.alloc(0);
  const end = Buffer.alloc(22 + comment.length);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.diskNumber ?? 0, 4);
  end.writeUInt16LE(options.centralDiskNumber ?? 0, 6);
  end.writeUInt16LE(options.entriesOnDisk ?? entries.length, 8);
  end.writeUInt16LE(options.totalEntries ?? entries.length, 10);
  end.writeUInt32LE(options.centralDirectorySize ?? centralSection.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(comment.length, 20);
  comment.copy(end, 22);

  return {
    buffer: Buffer.concat([localSection, centralSection, end]),
    centralOffsets: relativeCentralOffsets.map(
      (offset) => localSection.length + offset
    ),
    localOffsets,
    eocdOffset: localSection.length + centralSection.length
  };
}

function limits(overrides: Partial<PcmArchiveLimits> = {}): PcmArchiveLimits {
  return {
    ...DEFAULT_PCM_ARCHIVE_LIMITS,
    ...overrides
  };
}

function stageEntries(root: string, target: string): string[] {
  const prefix = `.${path.basename(target)}.pcm-stage-`;
  return fs.readdirSync(root).filter((entry) => entry.startsWith(prefix));
}

describe('PCM archive security boundary (issue 563)', () => {
  it('keeps explicit production resource limits', () => {
    expect(DEFAULT_PCM_ARCHIVE_LIMITS).toEqual({
      maxArchiveBytes: 512 * 1024 * 1024,
      maxEntries: 25_000,
      maxEntryUncompressedBytes: 512 * 1024 * 1024,
      maxTotalUncompressedBytes: 2 * 1024 * 1024 * 1024
    });
  });

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
    ['stored', 0],
    ['deflate', 8]
  ])(
    'extracts %s ZIP entries inside the target directory',
    (_label, method) => {
      const root = tempRoot();
      const target = path.join(root, 'target');
      const archive = createZip([
        {
          name: 'symbols/Fixture.kicad_sym',
          data: Buffer.from('(kicad_symbol_lib)\n'),
          method
        }
      ]).buffer;

      const extracted = extractPcmZipArchive(archive, target);
      const expected = path.join(target, 'symbols', 'Fixture.kicad_sym');

      expect(extracted).toEqual([expected]);
      expect(fs.readFileSync(expected, 'utf8')).toBe('(kicad_symbol_lib)\n');
    }
  );

  it('ignores EOCD-like signatures inside the ZIP comment', () => {
    const root = tempRoot();
    const target = path.join(root, 'target');
    const fakeEocd = Buffer.alloc(EOCD_BYTES);
    fakeEocd.writeUInt32LE(0x06054b50, 0);
    const archive = createZip(
      [{ name: 'real.txt', data: Buffer.from('real') }],
      { comment: fakeEocd }
    ).buffer;

    expect(extractPcmZipArchive(archive, target)).toEqual([
      path.join(target, 'real.txt')
    ]);
    expect(fs.readFileSync(path.join(target, 'real.txt'), 'utf8')).toBe('real');
  });

  it('rejects multiple structurally valid EOCD records', () => {
    const base = createZip([{ name: 'real.txt', data: Buffer.from('real') }]);
    const fakeEocd = Buffer.alloc(EOCD_BYTES);
    const fakeOffset = base.eocdOffset + EOCD_BYTES;
    fakeEocd.writeUInt32LE(0x06054b50, 0);
    fakeEocd.writeUInt32LE(fakeOffset, 16);
    const archive = createZip(
      [{ name: 'real.txt', data: Buffer.from('real') }],
      { comment: fakeEocd }
    ).buffer;

    expect(() => extractPcmZipArchive(archive, tempRoot())).toThrow(
      /multiple.*end-of-central-directory/i
    );
  });

  it('creates directory entries without reporting them as extracted files', () => {
    const root = tempRoot();
    const target = path.join(root, 'target');
    const archive = createZip([
      { name: 'symbols/', data: Buffer.alloc(0) }
    ]).buffer;

    expect(extractPcmZipArchive(archive, target)).toEqual([]);
    expect(fs.statSync(path.join(target, 'symbols')).isDirectory()).toBe(true);
  });

  it('rejects archives and entry counts above configured limits', () => {
    const archive = createZip([
      { name: 'a.txt', data: Buffer.from('a') },
      { name: 'b.txt', data: Buffer.from('b') }
    ]).buffer;

    expect(() =>
      extractPcmZipArchive(
        archive,
        tempRoot(),
        limits({ maxArchiveBytes: archive.length - 1 })
      )
    ).toThrow(/maximum archive size/i);
    expect(() =>
      extractPcmZipArchive(archive, tempRoot(), limits({ maxEntries: 1 }))
    ).toThrow(/entry count.*maximum/i);
  });

  it('rejects per-entry and aggregate uncompressed-byte declarations', () => {
    const oversizedEntry = createZip([
      {
        name: 'large.bin',
        data: Buffer.from('tiny'),
        centralUncompressedSize: 9,
        localUncompressedSize: 9
      }
    ]).buffer;
    expect(() =>
      extractPcmZipArchive(
        oversizedEntry,
        tempRoot(),
        limits({ maxEntryUncompressedBytes: 8 })
      )
    ).toThrow(/entry.*uncompressed size.*maximum/i);

    const aggregate = createZip([
      { name: 'a.bin', data: Buffer.alloc(5) },
      { name: 'b.bin', data: Buffer.alloc(5) }
    ]).buffer;
    expect(() =>
      extractPcmZipArchive(
        aggregate,
        tempRoot(),
        limits({ maxTotalUncompressedBytes: 9 })
      )
    ).toThrow(/total uncompressed size.*maximum/i);
  });

  it('rejects truncated and out-of-range archive structures deterministically', () => {
    const built = createZip([
      { name: 'Fixture.kicad_sym', data: Buffer.from('fixture') }
    ]);
    expect(() =>
      extractPcmZipArchive(
        built.buffer.subarray(0, built.eocdOffset + 18),
        tempRoot()
      )
    ).toThrow(/end of central directory is truncated/i);

    const centralOutside = Buffer.from(built.buffer);
    centralOutside.writeUInt32LE(
      centralOutside.length + 100,
      built.eocdOffset + 16
    );
    expect(() => extractPcmZipArchive(centralOutside, tempRoot())).toThrow(
      /central directory.*archive bounds/i
    );

    const localOutside = Buffer.from(built.buffer);
    localOutside.writeUInt32LE(
      localOutside.length + 100,
      built.centralOffsets[0]! + 42
    );
    expect(() => extractPcmZipArchive(localOutside, tempRoot())).toThrow(
      /local header.*archive bounds/i
    );

    const variableFieldsOutside = Buffer.from(built.buffer);
    variableFieldsOutside.writeUInt16LE(0xffff, built.centralOffsets[0]! + 28);
    expect(() =>
      extractPcmZipArchive(variableFieldsOutside, tempRoot())
    ).toThrow(/central directory entry.*archive bounds/i);

    const localVariableFieldsOutside = Buffer.from(built.buffer);
    localVariableFieldsOutside.writeUInt16LE(
      0xffff,
      built.localOffsets[0]! + 28
    );
    expect(() =>
      extractPcmZipArchive(localVariableFieldsOutside, tempRoot())
    ).toThrow(/local header.*archive bounds/i);

    const deflate = createZip([
      { name: 'Fixture.kicad_sym', data: Buffer.from('fixture'), method: 8 }
    ]);
    const compressedDataOutside = Buffer.from(deflate.buffer);
    const oversizedCompressedLength = deflate.eocdOffset;
    compressedDataOutside.writeUInt32LE(
      oversizedCompressedLength,
      deflate.centralOffsets[0]! + 20
    );
    compressedDataOutside.writeUInt32LE(
      oversizedCompressedLength,
      deflate.localOffsets[0]! + 18
    );
    expect(() =>
      extractPcmZipArchive(compressedDataOutside, tempRoot())
    ).toThrow(/compressed data.*archive bounds/i);
  });

  it('rejects multi-disk, ZIP64, encrypted, and data-descriptor archives', () => {
    const entry = { name: 'Fixture.kicad_sym', data: Buffer.from('fixture') };
    expect(() =>
      extractPcmZipArchive(
        createZip([entry], { diskNumber: 1 }).buffer,
        tempRoot()
      )
    ).toThrow(/multi-disk/i);
    expect(() =>
      extractPcmZipArchive(
        createZip([entry], { totalEntries: 0xffff }).buffer,
        tempRoot()
      )
    ).toThrow(/zip64/i);
    expect(() =>
      extractPcmZipArchive(
        createZip([{ ...entry, flags: 0x0801 }]).buffer,
        tempRoot()
      )
    ).toThrow(/encrypted/i);
    expect(() =>
      extractPcmZipArchive(
        createZip([{ ...entry, flags: 0x0808 }]).buffer,
        tempRoot()
      )
    ).toThrow(/data descriptor/i);
  });

  it('rejects central/local metadata drift and unsupported methods', () => {
    expect(() =>
      extractPcmZipArchive(
        createZip([
          {
            name: 'Fixture.kicad_sym',
            data: Buffer.from('fixture'),
            centralMethod: 8,
            localMethod: 0
          }
        ]).buffer,
        tempRoot()
      )
    ).toThrow(/central and local.*compression method/i);

    expect(() =>
      extractPcmZipArchive(
        createZip([
          {
            name: 'Fixture.kicad_sym',
            data: Buffer.from('fixture'),
            method: 99
          }
        ]).buffer,
        tempRoot()
      )
    ).toThrow(/unsupported zip compression method 99/i);
  });

  it('rejects stored and deflate size mismatches', () => {
    expect(() =>
      extractPcmZipArchive(
        createZip([
          {
            name: 'stored.bin',
            data: Buffer.from('four'),
            centralUncompressedSize: 5,
            localUncompressedSize: 5
          }
        ]).buffer,
        tempRoot()
      )
    ).toThrow(/stored entry sizes do not match/i);

    expect(() =>
      extractPcmZipArchive(
        createZip([
          {
            name: 'deflate.bin',
            data: Buffer.from('four'),
            method: 8,
            centralUncompressedSize: 5,
            localUncompressedSize: 5
          }
        ]).buffer,
        tempRoot()
      )
    ).toThrow(/decompressed size.*does not match/i);
  });

  it('bounds deflate output even when the archive understates its size', () => {
    const archive = createZip([
      {
        name: 'bomb.txt',
        data: Buffer.alloc(1024, 0x41),
        method: 8,
        centralUncompressedSize: 64,
        localUncompressedSize: 64
      }
    ]).buffer;

    expect(() =>
      extractPcmZipArchive(
        archive,
        tempRoot(),
        limits({
          maxEntryUncompressedBytes: 128,
          maxTotalUncompressedBytes: 128
        })
      )
    ).toThrow(/exceeds declared uncompressed size or configured limit/i);
  });

  it('preserves an existing target and cleans staging content on failure', () => {
    const root = tempRoot();
    const target = path.join(root, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'existing.txt'), 'keep', 'utf8');
    const archive = createZip([
      { name: 'good.txt', data: Buffer.from('new') },
      {
        name: 'bomb.txt',
        data: Buffer.alloc(1024, 0x41),
        method: 8,
        centralUncompressedSize: 64,
        localUncompressedSize: 64
      }
    ]).buffer;

    expect(() => extractPcmZipArchive(archive, target)).toThrow(
      /exceeds declared uncompressed size or configured limit/i
    );
    expect(fs.readFileSync(path.join(target, 'existing.txt'), 'utf8')).toBe(
      'keep'
    );
    expect(fs.existsSync(path.join(target, 'good.txt'))).toBe(false);
    expect(stageEntries(root, target)).toEqual([]);
  });

  it('replaces the target only after complete extraction succeeds', () => {
    const root = tempRoot();
    const target = path.join(root, 'target');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'existing.txt'), 'old', 'utf8');
    const archive = createZip([
      { name: 'new.txt', data: Buffer.from('new') }
    ]).buffer;

    expect(extractPcmZipArchive(archive, target)).toEqual([
      path.join(target, 'new.txt')
    ]);
    expect(fs.existsSync(path.join(target, 'existing.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(target, 'new.txt'), 'utf8')).toBe('new');
    expect(stageEntries(root, target)).toEqual([]);
  });

  it.each(['../x.txt', '..\\x.txt', '/absolute.txt', 'C:\\drive.txt'])(
    'skips unsafe entry %s without writing outside the target',
    (entryName) => {
      const root = tempRoot();
      const target = path.join(root, 'target');
      const archive = createZip([
        { name: entryName, data: Buffer.from('escape') }
      ]).buffer;

      expect(extractPcmZipArchive(archive, target)).toEqual([]);
      expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'absolute.txt'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'drive.txt'))).toBe(false);
    }
  );
});
