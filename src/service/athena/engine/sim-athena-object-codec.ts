import { gunzipSync, inflateSync, zstdDecompressSync } from "node:zlib";

import { SimAthenaSetUpError } from "../error/sim-athena.error.js";

/** The file extensions naming a codec, against what decompresses each one. */
const codecs = new Map<string, (bytes: Buffer) => Buffer>([
  ["gz", gunzipSync],
  ["zst", zstdDecompressSync],
  ["deflate", inflateSync],
]);

/**
 * The file extensions naming a codec nothing here decompresses.
 *
 * Node's standard library has gzip, zstd and deflate. The rest would need a
 * dependency, and this package takes none for a test to install.
 */
const unreadableCodecs = new Set(["bz2", "bzip2", "lz4", "lzo", "snappy"]);

/**
 * One object's bytes, decompressed by the codec its key names.
 *
 * Athena reads the file extension, and so does this. A key ending `.gz` is
 * gzip whatever its bytes hold, and a key ending anything else is text. The
 * magic number would be the other way to tell, and it would read an object
 * real Athena skips.
 *
 * A key naming a codec this simulation has no decompressor for raises, and the
 * engine turns the query down. The declaration a test wrote answers it, which
 * is what an object the engine cannot open already does.
 */
export function simAthenaDecompressedBytes(key: string, bytes: Buffer): Buffer {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");

  if (dot === -1) {
    return bytes;
  }

  const extension = name.slice(dot + 1).toLowerCase();

  if (unreadableCodecs.has(extension)) {
    throw new SimAthenaSetUpError(
      `Unsupported sim Athena compression: ${extension}`,
    );
  }

  const decompress = codecs.get(extension);

  return decompress === undefined ? bytes : decompress(bytes);
}
