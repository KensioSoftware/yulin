import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import {
  simAthenaDelimitedRows,
  type SimAthenaDelimitedFormat,
} from "./sim-athena-delimited-records.js";
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";
import {
  simAthenaJsonRows,
  type SimAthenaJsonFormat,
} from "./sim-athena-json-records.js";

/** One object's bytes, read into the rows it holds. */
export type SimAthenaRecordReader = (
  text: string,
) => readonly SimAthenaEngineRow[];

/** The SerDe class name that takes `mapping.<column>` parameters. */
const openXSerDe = "org.openx.data.jsonserde.jsonserde";

/** The SerDe class names that mean JSON lines. */
const jsonSerDes = new Set([
  openXSerDe,
  "org.apache.hive.hcatalog.data.jsonserde",
  "org.apache.hadoop.hive.serde2.jsonserde",
]);

/** What a `mapping.<column>` parameter is named with. */
const mappingPrefix = "mapping.";

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
    const format = jsonFormat(table, library);

    return (text) => simAthenaJsonRows(text, format);
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
 * How one table's JSON records reach its columns.
 *
 * Only the OpenX SerDe takes the mappings. The Hive JSON SerDes have no
 * `mapping` property, and a table declaring one against them reads by its
 * column names on real Athena the same as here.
 */
function jsonFormat(
  table: SimAthenaCatalogTable,
  library: string,
): SimAthenaJsonFormat {
  const parameters =
    library === openXSerDe
      ? (table.storageDescriptor?.SerdeInfo?.Parameters ?? {})
      : {};
  const mappings = new Map<string, string>();

  for (const [name, key] of Object.entries(parameters)) {
    if (name.toLowerCase().startsWith(mappingPrefix)) {
      mappings.set(name.slice(mappingPrefix.length), key);
    }
  }

  return {
    mappings,
    caseInsensitive: parameters["case.insensitive"]?.toLowerCase() !== "false",
  };
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
