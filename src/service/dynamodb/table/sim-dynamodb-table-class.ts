import type { SimDynamoDbTableClass } from "../command/table/table.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

const tableClasses: ReadonlySet<string> = new Set([
  "STANDARD",
  "STANDARD_INFREQUENT_ACCESS",
]);

/**
 * Read the table class a request names, if it names one.
 *
 * A table with no class named is a STANDARD table. It is kept as undefined
 * rather than filled in, because a table only reports a class here when the
 * request that made it asked for one.
 */
export function readSimDynamoDbTableClass(
  value: string | undefined,
): SimDynamoDbTableClass | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!tableClasses.has(value)) {
    throw new SimDynamoDbValidationException(
      `TableClass '${value}' is invalid. It is one of STANDARD or ` +
        `STANDARD_INFREQUENT_ACCESS.`,
    );
  }

  return value as SimDynamoDbTableClass;
}
