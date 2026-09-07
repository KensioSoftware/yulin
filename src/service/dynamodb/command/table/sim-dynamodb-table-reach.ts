import type { SimDynamoDbReached } from "../authorize/sim-dynamodb-reached.js";
import type { SimDynamoDbLeadingKeys } from "../authorize/sim-dynamodb-leading-keys.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";

/**
 * What one command's request reaches, for the condition keys authorization
 * supplies.
 *
 * The partition key values need the table to read them, so they arrive as a
 * function of it. The attribute names are read from the request's own
 * parameters before the table is reached, so they arrive as they are.
 */
export interface SimDynamoDbTableReach {
  readonly leadingKeys?: SimDynamoDbLeadingKeys | undefined;
  readonly attributes?: readonly string[] | undefined;
}

/**
 * Resolve what a request reaches against the table it named.
 *
 * Authorization runs ahead of the checks a command makes on what it was given,
 * as it does on AWS. A request whose key or key condition is malformed is
 * authorized carrying no values and refused by the check that follows, so
 * whatever reading them throws is dropped here. A table that is not there
 * leaves the values unread, since the key schema is what reads them.
 */
export function simDynamoDbReachedIn(
  reach: SimDynamoDbTableReach,
  table: SimDynamoDbTable | undefined,
): SimDynamoDbReached {
  return {
    leadingKeys: table === undefined ? undefined : leadingKeysIn(reach, table),
    attributes: reach.attributes,
  };
}

/**
 * Read the partition key values a request reaches, or none where they cannot
 * be read.
 */
function leadingKeysIn(
  reach: SimDynamoDbTableReach,
  table: SimDynamoDbTable,
): readonly string[] | undefined {
  try {
    return reach.leadingKeys?.(table);
  } catch {
    return undefined;
  }
}
