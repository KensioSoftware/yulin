import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";

/**
 * What one table of a batch asks for, against the table it names.
 */
export interface SimDynamoDbBatchTable<Requested> {
  readonly table: SimDynamoDbTable;
  readonly requested: Requested;
}

interface SimDynamoDbBatchReach {
  readonly access: SimDynamoDbTableAccess;
  readonly operation: string;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * Reach every table a batch names, authorizing the caller against each.
 *
 * AWS maps each DynamoDB operation to the `dynamodb:` action of the same name,
 * so the operation is the action as well as what a refusal names.
 *
 * Every table is reached before either command does anything with one, so a
 * batch write is refused whole rather than partly applied.
 */
export function reachSimDynamoDbBatchTables<
  Requested extends { readonly reference: string },
>(
  requested: readonly Requested[],
  reach: SimDynamoDbBatchReach,
): readonly SimDynamoDbBatchTable<Requested>[] {
  const action = `dynamodb:${reach.operation}`;
  const reached = requested.map((entry) => ({
    table: reach.access.required(action, entry.reference, reach.caller),
    requested: entry,
  }));

  assertDistinctTables(reached, reach.operation);

  return reached;
}

/**
 * Refuse a batch naming one table more than once.
 *
 * A map cannot hold one key twice, but a name and an ARN are two keys for one
 * table. Real DynamoDB takes each table name or ARN once per request, so the
 * tables are compared after the references have been resolved rather than as
 * they arrived. Checking here rather than per entry is also what keeps each
 * command's duplicate item check whole.
 */
function assertDistinctTables<Requested>(
  reached: readonly SimDynamoDbBatchTable<Requested>[],
  operation: string,
): void {
  const seen = new Set<string>();

  for (const { table } of reached) {
    if (seen.has(table.tableName)) {
      throw new SimDynamoDbValidationException(
        `Each table name or ARN can be used only once per ${operation} ` +
          `request, and this one names the table ${table.tableName} more ` +
          `than once`,
      );
    }

    seen.add(table.tableName);
  }
}
