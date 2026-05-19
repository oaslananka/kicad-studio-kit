import * as fs from 'node:fs/promises';
import * as path from 'node:path';

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  localHeaderOffset: number;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < CRC_TABLE.length; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[i] = value >>> 0;
}

export async function zipDirectory(
  sourceDir: string,
  outputFile: string
): Promise<string> {
  const files = await collectFiles(sourceDir);
  const entries: ZipEntry[] = [];
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const data = await fs.readFile(file);
    const name = path.relative(sourceDir, file).split(path.sep).join('/');
    const entry: ZipEntry = {
      name,
      data,
      crc32: crc32(data),
      localHeaderOffset: offset
    };
    const header = createLocalFileHeader(entry);
    localParts.push(header, data);
    offset += header.length + data.length;
    entries.push(entry);
  }

  const centralParts = entries.map((entry) =>
    createCentralDirectoryHeader(entry)
  );
  const centralDirectory = Buffer.concat(centralParts);
  const end = createEndOfCentralDirectory(
    entries.length,
    centralDirectory.length,
    offset
  );

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(
    outputFile,
    Buffer.concat([...localParts, centralDirectory, end])
  );
  return outputFile;
}

async function collectFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        result.push(absolute);
      }
    }
  };
  await visit(root);
  return result.sort();
}

function createLocalFileHeader(entry: ZipEntry): Buffer {
  const name = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  return header;
}

function createCentralDirectoryHeader(entry: ZipEntry): Buffer {
  const name = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localHeaderOffset, 42);
  name.copy(header, 46);
  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number
): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
