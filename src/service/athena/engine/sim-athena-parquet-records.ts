import {
  brotliDecompressSync,
  gunzipSync,
  inflateSync,
  zstdDecompressSync,
} from "node:zlib";

import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";
import { simAthenaParquetReader } from "./sim-athena-parquet-module.js";

/** One page's bytes, decompressed to the length its header declares. */
type SimAthenaPageDecompressor = (
  bytes: Uint8Array,
  size: number,
) => Uint8Array;

/**
 * The Parquet codecs Node's own zlib covers.
 *
 * `hyparquet` decompresses `UNCOMPRESSED` and `SNAPPY` itself, and snappy is
 * what Athena and Glue write by default. The three here are what `node:zlib`
 * adds for nothing. `LZO`, `LZ4` and `LZ4_RAW` are what is left, and a file in
 * one of those turns the query down.
 *
 * A Parquet file compresses per column chunk inside itself, so none of this
 * has anything to do with the codec an object's key names.
 */
const compressors: Readonly<Record<string, SimAthenaPageDecompressor>> = {
  GZIP: (bytes, size) => sized(gunzipSync(bytes), size),
  ZSTD: (bytes, size) => sized(zstdDecompressSync(bytes), size),
  BROTLI: (bytes, size) => sized(brotliDecompressSync(bytes), size),
  DEFLATE: (bytes, size) => sized(inflateSync(bytes), size),
};

/**
 * One decompressed page, cut to the length the page header declares.
 *
 * `hyparquet` checks the length itself and refuses a page that comes back
 * longer, which a codec padding its output would produce.
 */
function sized(buffer: Buffer, size: number): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, size);
}

/**
 * One Parquet object's rows.
 *
 * A Parquet file carries its own schema, so nothing here reads the table's Glue
 * columns. A column the table declares and the file has not got reads null, the
 * way a JSON record missing a key already does.
 *
 * `utf8` reads a `BYTE_ARRAY` column as text. Hive's `string` is what nearly
 * every one of them holds, and a Glue `binary` column already arrives as text
 * everywhere else in this engine.
 */
export async function simAthenaParquetRows(
  bytes: Uint8Array,
): Promise<readonly SimAthenaEngineRow[]> {
  const reader = await simAthenaParquetReader();

  return reader.parquetReadObjects({
    file: arrayBuffer(bytes),
    compressors,
    utf8: true,
  });
}

/**
 * One object's bytes as the `ArrayBuffer` the reader takes.
 *
 * A `Buffer` read out of simulated S3 is a view onto a larger pool, so the
 * whole of its own buffer is more than the object and the offsets have to be
 * carried through.
 */
function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
