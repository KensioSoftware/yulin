import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";
import type { SimGlueTable } from "../table/sim-glue-table.js";

/**
 * Read a declared partition value list, refusing one the table has no keys
 * for.
 *
 * A partition's values are positional, so a list of the wrong length lines up
 * with the wrong keys and there is no way to tell which value was meant for
 * which. Real Glue refuses it, and a table declaring no partition keys at all
 * refuses every partition by the same count.
 */
export function requiredSimGluePartitionValues(
  label: string,
  table: SimGlueTable,
  values: readonly string[] | undefined,
): readonly string[] {
  if (values === undefined) {
    throw new SimGlueInvalidInputException(`${label} is required`);
  }

  const declared = table.partitionKeys.length;

  if (values.length !== declared) {
    throw new SimGlueInvalidInputException(
      `${label} has ${counted(values.length, "value")}, and ${table.databaseName}.${table.name} declares ${counted(declared, "partition key")}`,
    );
  }

  return [...values];
}

function counted(total: number, noun: string): string {
  return `${total} ${noun}${total === 1 ? "" : "s"}`;
}
