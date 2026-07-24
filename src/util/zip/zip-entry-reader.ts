import { inflateRawSync } from "node:zlib";
import { ZipFormatError } from "./zip-format-error.js";

const localFileHeaderSignature = 0x04_03_4b_50;
const centralDirectorySignature = 0x02_01_4b_50;

const storeMethod = 0;
const deflateMethod = 8;

/**
 * Read one central directory entry into the files map, returning the offset
 * of the next central directory entry.
 */
export function readCentralDirectoryEntry(
  buffer: Buffer,
  offset: number,
  files: Map<string, Buffer>,
): number {
  if (buffer.readUInt32LE(offset) !== centralDirectorySignature) {
    throw new ZipFormatError(
      `Malformed zip archive: expected a central directory entry at byte ${String(offset)}`,
    );
  }

  const compressionMethod = buffer.readUInt16LE(offset + 10);
  const compressedSize = buffer.readUInt32LE(offset + 20);
  const nameLength = buffer.readUInt16LE(offset + 28);
  const extraLength = buffer.readUInt16LE(offset + 30);
  const commentLength = buffer.readUInt16LE(offset + 32);
  const localHeaderOffset = buffer.readUInt32LE(offset + 42);
  const filePath = buffer.toString(
    "utf8",
    offset + 46,
    offset + 46 + nameLength,
  );

  const isDirectory = filePath.endsWith("/");
  if (!isDirectory) {
    files.set(
      filePath,
      readFileContent(buffer, localHeaderOffset, compressedSize, {
        compressionMethod,
        filePath,
      }),
    );
  }

  return offset + 46 + nameLength + extraLength + commentLength;
}

function readFileContent(
  buffer: Buffer,
  localHeaderOffset: number,
  compressedSize: number,
  details: { compressionMethod: number; filePath: string },
): Buffer {
  if (buffer.readUInt32LE(localHeaderOffset) !== localFileHeaderSignature) {
    throw new ZipFormatError(
      `Malformed zip archive: expected a local file header for ${details.filePath}`,
    );
  }

  const nameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);

  if (details.compressionMethod === storeMethod) {
    return Buffer.from(compressed);
  }
  if (details.compressionMethod === deflateMethod) {
    return inflateRawSync(compressed);
  }
  throw new ZipFormatError(
    `Unsupported zip compression method ${String(details.compressionMethod)} ` +
      `for ${details.filePath}; only stored and deflate entries are supported`,
  );
}
