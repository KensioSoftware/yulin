import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import type { SimAthenaDelimitedFormat } from "./sim-athena-delimited-records.js";

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
 * How one table's delimited objects are read, or nothing where its SerDe names
 * no delimited format.
 */
export function simAthenaDelimitedFormat(
  table: SimAthenaCatalogTable,
  library: string,
): SimAthenaDelimitedFormat | undefined {
  const defaults = delimitedSerDes.get(library);

  if (defaults === undefined) {
    return undefined;
  }

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
