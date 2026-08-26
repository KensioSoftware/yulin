import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  simAthenaDelimitedRows,
  type SimAthenaDelimitedFormat,
} from "./sim-athena-delimited-records.js";
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";

/** One object's bytes, read into the rows it holds. */
export type SimAthenaRecordReader = (
  text: string,
) => readonly SimAthenaEngineRow[];

/** The SerDe class names that mean JSON lines. */
const jsonSerDes = new Set([
  "org.openx.data.jsonserde.jsonserde",
  "org.apache.hive.hcatalog.data.jsonserde",
  "org.apache.hadoop.hive.serde2.jsonserde",
]);

/** What one delimited SerDe reads before its parameters are applied. */
interface SimAthenaSerDeDefaults {
  readonly delimiter: string;
  readonly quoted: boolean;
}

/**
 * The SerDe class names that mean delimited text, and what each one reads
 * before the table's own parameters are applied.
 *
 * `OpenCSVSerde` is comma separated and quoted. `LazySimpleSerDe` is what
 * `ROW FORMAT DELIMITED` gives: it quotes nothing, and its own default
 * delimiter is the control character Hive has always used rather than a comma.
 */
const delimitedSerDes: ReadonlyMap<string, SimAthenaSerDeDefaults> = new Map([
  [
    "org.apache.hadoop.hive.serde2.opencsvserde",
    { delimiter: ",", quoted: true },
  ],
  [
    "org.apache.hadoop.hive.serde2.lazy.lazysimpleserde",
    { delimiter: "\u{1}", quoted: false },
  ],
]);

/**
 * How one table's objects are decoded, or nothing where this simulation has no
 * reader for what the table declares.
 *
 * The SerDe is what says so, the way it says so on real Athena. A table
 * holding Parquet or ORC lands here, and the query falls back to whatever a
 * test declared. A table declaring no SerDe at all lands here too: nothing
 * else in the catalog says what the bytes are, and guessing would answer a
 * Parquet query with nonsense rather than turning it down.
 */
export function simAthenaRecordReader(
  table: SimAthenaCatalogTable,
): SimAthenaRecordReader | undefined {
  const library =
    table.storageDescriptor?.SerdeInfo?.SerializationLibrary?.toLowerCase();

  if (library === undefined) {
    return undefined;
  }

  if (jsonSerDes.has(library)) {
    return jsonRows;
  }

  const defaults = delimitedSerDes.get(library);

  if (defaults === undefined) {
    return undefined;
  }

  const format = delimitedFormat(table, defaults);
  const columns = table.columns.map((column) => column.Name);

  return (text) => simAthenaDelimitedRows(text, format, columns);
}

/**
 * JSON lines, one record per line.
 *
 * A nested object or array is kept as its JSON text, which is what makes
 * `json_extract_scalar` and `cardinality` reach into it.
 */
function jsonRows(text: string): readonly SimAthenaEngineRow[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as SimAthenaEngineRow);
}

function delimitedFormat(
  table: SimAthenaCatalogTable,
  defaults: SimAthenaSerDeDefaults,
): SimAthenaDelimitedFormat {
  const parameters = table.storageDescriptor?.SerdeInfo?.Parameters ?? {};
  const quoted = defaults.quoted || parameters["quoteChar"] !== undefined;

  return {
    delimiter:
      parameters["separatorChar"] ??
      parameters["field.delim"] ??
      defaults.delimiter,
    quote: quoted ? (parameters["quoteChar"] ?? '"') : undefined,
    escape: quoted ? (parameters["escapeChar"] ?? "\\") : undefined,
    skipHeaderLines: skippedHeaderLines(table),
  };
}

/**
 * How many lines of every object are a header rather than a row.
 *
 * `skip.header.line.count` is a table property on real Athena, and the storage
 * descriptor's own parameters are read as well because a template can put it
 * in either place.
 */
function skippedHeaderLines(table: SimAthenaCatalogTable): number {
  const declared =
    table.parameters["skip.header.line.count"] ??
    table.storageDescriptor?.Parameters?.["skip.header.line.count"];
  const count = Math.trunc(Number(declared ?? ""));

  return Number.isFinite(count) && count > 0 ? count : 0;
}
