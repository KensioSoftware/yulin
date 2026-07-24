import { readCentralDirectoryEntry } from "./zip-entry-reader.js";
import { ZipFormatError } from "./zip-format-error.js";

export { ZipFormatError } from "./zip-format-error.js";

const endOfCentralDirectorySignature = 0x06_05_4b_50;
const endOfCentralDirectorySize = 22;
const maxCommentSize = 0xff_ff;

/**
 * A read-only zip archive parsed from bytes, held in memory.
 *
 * Supports the stored and deflate compression methods, which covers zip
 * archives produced by common AWS deployment tooling. Zip64 archives are not
 * supported.
 */
export class SimZipArchive {
  private constructor(private readonly files: Map<string, Buffer>) {}

  /**
   * Parse a zip archive from bytes.
   */
  static fromBytes(bytes: Uint8Array): SimZipArchive {
    try {
      return new SimZipArchive(readZipFiles(Buffer.from(bytes)));
    } catch (error) {
      if (error instanceof ZipFormatError) {
        throw error;
      }
      throw new ZipFormatError(
        `Could not read bytes as a zip archive: ${String(error)}`,
      );
    }
  }

  /**
   * List the file paths in this archive, excluding directory entries.
   */
  filePaths(): readonly string[] {
    return this.files.keys().toArray();
  }

  /**
   * See whether the archive contains a file at the given path.
   */
  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /**
   * Get the content of the file at the given path.
   */
  file(filePath: string): Buffer {
    const content = this.files.get(filePath);
    if (content === undefined) {
      throw new ZipFormatError(
        `No file at path ${filePath} in zip archive; ` +
          `archive contains: ${this.filePaths().join(", ")}`,
      );
    }
    return content;
  }
}

function readZipFiles(buffer: Buffer): Map<string, Buffer> {
  const endRecordOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endRecordOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endRecordOffset + 16);

  if (entryCount === 0xff_ff || centralDirectoryOffset === 0xff_ff_ff_ff) {
    throw new ZipFormatError("Zip64 archives are not supported");
  }

  const files = new Map<string, Buffer>();
  let offset = centralDirectoryOffset;
  for (let entry = 0; entry < entryCount; entry += 1) {
    offset = readCentralDirectoryEntry(buffer, offset, files);
  }
  return files;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const earliestOffset = Math.max(
    0,
    buffer.length - endOfCentralDirectorySize - maxCommentSize,
  );
  for (
    let offset = buffer.length - endOfCentralDirectorySize;
    offset >= earliestOffset;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) === endOfCentralDirectorySignature) {
      return offset;
    }
  }
  throw new ZipFormatError(
    "No end-of-central-directory record found; not a zip archive",
  );
}
