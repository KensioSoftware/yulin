import { crc32 } from "./crc32.js";

/**
 * One file entry being written into a zip archive.
 */
export interface ZipFileEntry {
  readonly filePath: string;
  readonly content: Buffer;
  readonly compressed: Buffer;
  readonly compressionMethod: number;
}

/**
 * Write a zip local file header record for an entry.
 */
export function writeLocalFileHeader(entry: ZipFileEntry): Buffer {
  const namePath = Buffer.from(entry.filePath, "utf8");
  const header = Buffer.alloc(30 + namePath.length);
  header.writeUInt32LE(0x04_03_4b_50, 0);
  header.writeUInt16LE(20, 4); // Version needed to extract.
  header.writeUInt16LE(entry.compressionMethod, 8);
  header.writeUInt32LE(crc32(entry.content), 14);
  header.writeUInt32LE(entry.compressed.length, 18);
  header.writeUInt32LE(entry.content.length, 22);
  header.writeUInt16LE(namePath.length, 26);
  namePath.copy(header, 30);
  return header;
}

/**
 * Write a zip central directory record for an entry.
 */
export function writeCentralDirectoryEntry(
  entry: ZipFileEntry,
  localOffset: number,
): Buffer {
  const namePath = Buffer.from(entry.filePath, "utf8");
  const record = Buffer.alloc(46 + namePath.length);
  record.writeUInt32LE(0x02_01_4b_50, 0);
  record.writeUInt16LE(20, 4); // Version made by.
  record.writeUInt16LE(20, 6); // Version needed to extract.
  record.writeUInt16LE(entry.compressionMethod, 10);
  record.writeUInt32LE(crc32(entry.content), 16);
  record.writeUInt32LE(entry.compressed.length, 20);
  record.writeUInt32LE(entry.content.length, 24);
  record.writeUInt16LE(namePath.length, 28);
  record.writeUInt32LE(localOffset, 42);
  namePath.copy(record, 46);
  return record;
}

/**
 * Write the zip end-of-central-directory record.
 */
export function writeEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Buffer {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06_05_4b_50, 0);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralDirectorySize, 12);
  record.writeUInt32LE(centralDirectoryOffset, 16);
  return record;
}
