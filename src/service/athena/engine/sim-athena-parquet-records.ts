// SPIKE ONLY. Nothing here is shaped for production. The import is static so
// the spike stays short, and a real one would load hyparquet by dynamic import
// the way the SQL parser is loaded.
import {
  brotliDecompressSync,
  gunzipSync,
  zstdDecompressSync,
} from "node:zlib";

import { parquetReadObjects } from "hyparquet";

import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";

/**
 * The codecs Node's own zlib covers, in the shape hyparquet asks for.
 *
 * hyparquet decompresses `UNCOMPRESSED` and `SNAPPY` itself, and snappy is what
 * Athena and Glue write by default. `GZIP`, `ZSTD` and `BROTLI` reach here, and
 * `node:zlib` already has all three. `LZO`, `LZ4` and `LZ4_RAW` are left, and
 * each of those would need a dependency.
 */
const compressors = {
  GZIP: (bytes: Uint8Array, size: number) => sized(gunzipSync(bytes), size),
  ZSTD: (bytes: Uint8Array, size: number) =>
    sized(zstdDecompressSync(bytes), size),
  BROTLI: (bytes: Uint8Array, size: number) =>
    sized(brotliDecompressSync(bytes), size),
};

function sized(buffer: Buffer, size: number): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, size);
}

/**
 * One Parquet object's rows.
 *
 * The file carries its own schema, so nothing here reads the Glue columns. A
 * name the table declares and the file has not got reads null, which is what
 * `simAthenaRowValue` already does for a JSON record missing a key.
 */
export async function simAthenaParquetRows(
  bytes: Uint8Array,
): Promise<readonly SimAthenaEngineRow[]> {
  const file = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const rows = await parquetReadObjects({ file, compressors, utf8: true });

  return rows as readonly SimAthenaEngineRow[];
}
