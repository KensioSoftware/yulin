import { deflateRawSync } from "node:zlib";
import {
  writeCentralDirectoryEntry,
  writeEndOfCentralDirectory,
  writeLocalFileHeader,
  type ZipFileEntry,
} from "./zip-record-writer.js";

export type ZipCompression = "deflate" | "store";

interface AddFileOptions {
  readonly compression?: ZipCompression;
}

const storeMethod = 0;
const deflateMethod = 8;

/**
 * Builds a real zip archive from in-memory files.
 *
 * The output is a standards-conforming zip that any unzip tool can read, so
 * simulated Lambda code archives round-trip with real AWS tooling.
 */
export class SimZipArchiveBuilder {
  private readonly entries: ZipFileEntry[] = [];

  /**
   * Add a file to the archive. Deflate compression is used unless the store
   * method is requested.
   */
  addFile(
    filePath: string,
    content: string | Uint8Array,
    options: AddFileOptions = {},
  ): this {
    const { compression = "deflate" } = options;
    const contentBuffer = this.toBuffer(content);
    this.entries.push({
      filePath,
      content: contentBuffer,
      compressed: this.compress(contentBuffer, compression),
      compressionMethod: this.compressionMethod(compression),
    });
    return this;
  }

  /**
   * Serialise the archive to zip bytes.
   */
  toBytes(): Uint8Array {
    const parts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let localOffset = 0;

    for (const entry of this.entries) {
      const localHeader = writeLocalFileHeader(entry);
      centralParts.push(writeCentralDirectoryEntry(entry, localOffset));
      parts.push(localHeader, entry.compressed);
      localOffset += localHeader.length + entry.compressed.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    parts.push(
      centralDirectory,
      writeEndOfCentralDirectory(
        this.entries.length,
        centralDirectory.length,
        localOffset,
      ),
    );
    return Buffer.concat(parts);
  }

  private toBuffer(content: string | Uint8Array): Buffer {
    if (typeof content === "string") {
      return Buffer.from(content, "utf8");
    }
    return Buffer.from(content);
  }

  private compress(content: Buffer, compression: ZipCompression): Buffer {
    if (compression === "store") {
      return content;
    }
    return deflateRawSync(content);
  }

  private compressionMethod(compression: ZipCompression): number {
    if (compression === "store") {
      return storeMethod;
    }
    return deflateMethod;
  }
}
