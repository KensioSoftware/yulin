/** Parquet logical types a Glue table commonly declares, read back. */
import { parquetWriteBuffer } from "hyparquet-writer";
import { parquetReadObjects, parquetMetadata } from "hyparquet";

function show(value: unknown): string {
  if (typeof value === "bigint") {
    return `${value.toString()}n (bigint)`;
  }
  if (value instanceof Date) {
    return `${value.toISOString()} (Date)`;
  }
  if (value instanceof Uint8Array) {
    return `${String(value.length)} bytes (Uint8Array)`;
  }

  return `${JSON.stringify(value)} (${typeof value})`;
}

const buffer = parquetWriteBuffer({
  codec: "SNAPPY",
  columnData: [
    { name: "an_int", data: [42], type: "INT32" },
    { name: "a_bigint", data: [9_007_199_254_740_993n], type: "INT64" },
    { name: "a_double", data: [1.5], type: "DOUBLE" },
    { name: "a_float", data: [1.5], type: "FLOAT" },
    { name: "a_bool", data: [true], type: "BOOLEAN" },
    { name: "a_string", data: ["hello"], type: "STRING" },
    {
      name: "a_timestamp",
      data: [new Date("2026-08-01T10:00:00Z")],
      type: "TIMESTAMP",
    },
    { name: "a_binary", data: [new Uint8Array([1, 2, 3])], type: "BYTE_ARRAY" },
    { name: "a_struct", data: [{ nested: 1 }] },
    { name: "a_list", data: [["x", "y"]] },
  ],
});

const rows = await parquetReadObjects({ file: buffer });
const row = rows[0] as Record<string, unknown>;

console.log("=== Types out of hyparquet ===");
for (const [name, value] of Object.entries(row)) {
  console.log(`  ${name.padEnd(14)} ${show(value)}`);
}

console.log("\n=== Column projection ===");
const one = await parquetReadObjects({ file: buffer, columns: ["a_string"] });
console.log(`  columns: ["a_string"] gives ${JSON.stringify(one[0])}`);
console.log(
  "  so a reader that knew which columns a query touches could read only those.",
);

console.log("\n=== Row group metadata ===");
const metadata = parquetMetadata(buffer);
for (const group of metadata.row_groups) {
  for (const column of group.columns.slice(0, 3)) {
    console.log(
      `  ${(column.meta_data?.path_in_schema ?? []).join(".").padEnd(14)}` +
        ` ${String(column.meta_data?.total_compressed_size ?? 0)} compressed bytes`,
    );
  }
}
console.log(
  "  the per-column byte sizes DataScannedInBytes would need are in the footer.",
);
