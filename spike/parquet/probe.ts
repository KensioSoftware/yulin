/**
 * What hyparquet reads, measured against Parquet files this repository did not
 * write. The files come from apache/parquet-testing, written by parquet-mr,
 * which is the Java writer Athena CTAS and Glue jobs both use.
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  gunzipSync,
  zstdDecompressSync,
  brotliDecompressSync,
} from "node:zlib";

import { parquetMetadata, parquetSchema, parquetReadObjects } from "hyparquet";

const directory = process.argv[2] ?? "pq";

/** One row, with the BigInt an INT64 column arrives as made printable. */
function show(row: unknown): string {
  return JSON.stringify(row, (_key, value: unknown) =>
    typeof value === "bigint" ? `${value.toString()}n` : value,
  );
}

/**
 * Everything Node's own zlib can decompress, in the shape hyparquet takes.
 *
 * hyparquet decompresses UNCOMPRESSED and SNAPPY on its own. The rest arrive
 * here, and three of the five are codecs `node:zlib` already has.
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

for (const name of readdirSync(directory).sort()) {
  if (!name.endsWith(".parquet")) {
    continue;
  }

  const bytes = readFileSync(`${directory}/${name}`);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  try {
    const metadata = parquetMetadata(buffer);
    const schema = parquetSchema(metadata);
    const codecs = new Set(
      metadata.row_groups.flatMap((group) =>
        group.columns.map((column) => column.meta_data?.codec),
      ),
    );
    const encodings = new Set(
      metadata.row_groups.flatMap((group) =>
        group.columns.flatMap((column) => column.meta_data?.encodings ?? []),
      ),
    );
    const rows = await parquetReadObjects({ file: buffer, compressors });

    console.log(
      `\n${name}\n  writer     ${metadata.created_by ?? "unknown"}` +
        `\n  rows       ${String(metadata.num_rows)} in ${String(metadata.row_groups.length)} row group(s)` +
        `\n  codecs     ${[...codecs].join(", ")}` +
        `\n  encodings  ${[...encodings].join(", ")}` +
        `\n  columns    ${schema.children.map((child) => `${child.element.name}:${child.element.type ?? "GROUP"}`).join(" ")}` +
        `\n  read       ${String(rows.length)} rows, first ${show(rows[0]).slice(0, 200)}`,
    );
  } catch (error) {
    console.log(`\n${name}\n  FAILED  ${(error as Error).message}`);
  }
}
