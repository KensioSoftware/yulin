import type { SimGlueColumn } from "../table/sim-glue-table-schema.js";

/**
 * How one partition key's values are put in order.
 *
 * A key typed as a number compares numerically, so `10` sorts above `9`.
 * Everything else compares as text, which is what a date written the ISO way
 * wants anyway.
 */
export type SimGluePartitionComparison = "number" | "text";

/** The Glue column types whose values are ordered as numbers. */
const numericTypes = new Set([
  "byte",
  "short",
  "tinyint",
  "smallint",
  "int",
  "integer",
  "bigint",
  "long",
  "float",
  "double",
  "decimal",
  "numeric",
]);

/** One partition key an expression may name. */
export interface SimGluePartitionColumn {
  readonly name: string;
  readonly index: number;
  readonly comparison: SimGluePartitionComparison;
}

/**
 * The partition keys of one table, by the names an expression writes.
 *
 * A partition's values are positional, so what a column resolves to is the
 * place its value sits in that list.
 *
 * Names are matched however they were written. Real Glue folds a column name
 * to lower case when it stores one, and an expression naming `Day` reaches a
 * key stored as `day`.
 */
export class SimGluePartitionColumns {
  readonly #columns = new Map<string, SimGluePartitionColumn>();

  constructor(partitionKeys: readonly SimGlueColumn[]) {
    for (const [index, key] of partitionKeys.entries()) {
      this.#columns.set(key.Name.toLowerCase(), {
        name: key.Name,
        index,
        comparison: simGluePartitionComparison(key.Type),
      });
    }
  }

  /** Find a partition key by the name an expression wrote. */
  find(name: string): SimGluePartitionColumn | undefined {
    return this.#columns.get(name.toLowerCase());
  }

  /** Every partition key name, in the order the table declares them. */
  get names(): readonly string[] {
    return this.#columns
      .values()
      .map((column) => column.name)
      .toArray();
  }
}

/**
 * How a column of this declared type compares.
 *
 * The type carries its parameters on real Glue, as `decimal(10,2)` does, so
 * only the word in front of them is read.
 */
export function simGluePartitionComparison(
  type: string | undefined,
): SimGluePartitionComparison {
  const declared = (type ?? "").trim().toLowerCase();
  const bracket = declared.indexOf("(");
  const named = bracket === -1 ? declared : declared.slice(0, bracket);

  return numericTypes.has(named) ? "number" : "text";
}
