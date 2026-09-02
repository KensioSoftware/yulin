import type { SimAthenaCatalogTable } from "../table/sim-athena-catalog-table.js";
import { simAthenaDelimitedFormat } from "./sim-athena-delimited-format.js";
import { simAthenaDelimitedRows } from "./sim-athena-delimited-records.js";
import type { SimAthenaEngineRow } from "./sim-athena-engine-row.js";
import {
  simAthenaJsonRows,
  type SimAthenaJsonFormat,
} from "./sim-athena-json-records.js";
import { simAthenaParquetRows } from "./sim-athena-parquet-records.js";

/**
 * One object's bytes, read into the rows it holds.
 *
 * The bytes rather than the text, because Parquet is binary and carries its own
 * schema. A reader may answer with a promise for the same reason, since reading
 * one is asynchronous.
 */
export type SimAthenaRecordReader = (
  bytes: Uint8Array,
) => readonly SimAthenaEngineRow[] | Promise<readonly SimAthenaEngineRow[]>;

/** The SerDe class name that takes `mapping.<column>` parameters. */
const openXSerDe = "org.openx.data.jsonserde.jsonserde";

/**
 * The SerDe class names that mean Parquet.
 *
 * Glue and the Athena `CREATE TABLE` documentation both name the first. The
 * second is what an older Hive table carries, and Athena still reads one.
 */
const parquetSerDes = new Set([
  "org.apache.hadoop.hive.ql.io.parquet.serde.parquethiveserde",
  "parquet.hive.serde.parquethiveserde",
]);

/** The SerDe class names that mean JSON lines. */
const jsonSerDes = new Set([
  openXSerDe,
  "org.apache.hive.hcatalog.data.jsonserde",
  "org.apache.hadoop.hive.serde2.jsonserde",
]);

/** What a `mapping.<column>` parameter is named with. */
const mappingPrefix = "mapping.";

/**
 * How one table's objects are decoded, or nothing where this simulation has no
 * reader for what the table declares.
 *
 * The SerDe is what says so, the way it says so on real Athena. A table
 * holding ORC lands here, and the query falls back to whatever a test declared.
 * A table declaring no SerDe at all lands here too. Nothing else in the catalog
 * says what the bytes are, and guessing would answer with nonsense where
 * turning the query down is the honest reply.
 */
export function simAthenaRecordReader(
  table: SimAthenaCatalogTable,
): SimAthenaRecordReader | undefined {
  const library =
    table.storageDescriptor?.SerdeInfo?.SerializationLibrary?.toLowerCase();

  if (library === undefined) {
    return undefined;
  }

  if (parquetSerDes.has(library)) {
    return simAthenaParquetRows;
  }

  if (jsonSerDes.has(library)) {
    const format = jsonFormat(table, library);

    return (bytes) => simAthenaJsonRows(decodedText(bytes), format);
  }

  const format = simAthenaDelimitedFormat(table, library);

  if (format === undefined) {
    return undefined;
  }

  const columns = table.columns.map((column) => column.Name);

  return (bytes) => simAthenaDelimitedRows(decodedText(bytes), format, columns);
}

/** One object's bytes as the text a JSON or delimited reader wants. */
function decodedText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
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
