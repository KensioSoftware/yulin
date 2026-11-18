import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import type { SimDynamoDbReached } from "../authorize/sim-dynamodb-reached.js";
import type {
  SimDynamoDbLeadingKeys,
  SimDynamoDbPartitionKeyValues,
} from "../authorize/sim-dynamodb-leading-keys.js";
import type { SimDynamoDbRequestKeys } from "../authorize/sim-dynamodb-request-keys.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";

/**
 * What one command's request reaches, for the condition keys authorization
 * supplies.
 *
 * The partition key values need the table to read them, so they arrive as a
 * function of it. The attribute names are read from the request's own
 * parameters before the table is reached, so they arrive as they are.
 *
 * A read naming one of the table's indexes carries the index name. The index
 * is then the resource authorized. The request parameters a condition key is
 * named after arrive as the values to supply.
 */
export interface SimDynamoDbTableReach extends SimDynamoDbRequestKeys {
  readonly leadingKeys?: SimDynamoDbLeadingKeys | undefined;
  readonly attributes?: readonly string[] | undefined;
  readonly indexName?: string | undefined;
  readonly requestConditions?: SimIamConditions | undefined;
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
  const { leadingKeys: _leadingKeys, ...rest } = reach;

  return {
    ...rest,
    partitionKeys:
      table === undefined ? undefined : leadingKeysIn(reach, table),
  };
}

/**
 * Read the partition key values a request reaches, or none where they cannot
 * be read.
 */
function leadingKeysIn(
  reach: SimDynamoDbTableReach,
  table: SimDynamoDbTable,
): SimDynamoDbPartitionKeyValues | undefined {
  try {
    return reach.leadingKeys?.(table);
  } catch {
    return undefined;
  }
}
