import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { simDynamoDbReturnConsumedCapacityKey } from "../authorize/sim-dynamodb-request-keys.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type { SimDynamoDbTableReach } from "../table/sim-dynamodb-table-reach.js";

/**
 * What every action of a transaction knows about where it is pointing.
 */
interface SimDynamoDbTransactItem {
  readonly reference: string | undefined;
  readonly action: string;

  keyIn(table: SimDynamoDbTable): string;
  reach(): SimDynamoDbTableReach;
}

/**
 * One action of a transaction, against the table it names.
 */
export interface SimDynamoDbTransactTarget<Item> {
  readonly item: Item;
  readonly table: SimDynamoDbTable;
}

interface SimDynamoDbTransactReach {
  readonly access: SimDynamoDbTableAccess;
  readonly caller: SimAwsCaller | undefined;

  /** `TransactWriteItems` or `TransactGetItems`. */
  readonly operation: string;
  readonly returnConsumedCapacity: string | undefined;
}

/**
 * Reach the table every action of a transaction names, authorizing the caller
 * against each.
 *
 * A transaction is authorized as the operations it is made of rather than as
 * itself, so each action carries the `dynamodb:` action it needs. A caller
 * allowed to put but not to delete is refused a transaction that does both.
 * Each is authorized with the condition keys of its own item, and with
 * `dynamodb:EnclosingOperation` naming the transaction, which is how a policy
 * tells a transactional write from a plain one.
 *
 * Every table is reached and every key marshalled before anything is written,
 * so a transaction DynamoDB would refuse leaves the tables as they were.
 */
export function reachSimDynamoDbTransactTables<
  Item extends SimDynamoDbTransactItem,
>(
  items: readonly Item[],
  reach: SimDynamoDbTransactReach,
): readonly SimDynamoDbTransactTarget<Item>[] {
  const targets = items.map((item) => ({
    item,
    table: reach.access.required(item.action, item.reference, reach.caller, {
      ...item.reach(),
      enclosingOperation: reach.operation,
      returnConsumedCapacity: simDynamoDbReturnConsumedCapacityKey(
        reach.returnConsumedCapacity,
      ),
    }),
  }));

  assertDistinctItems(targets);

  return targets;
}

/**
 * Refuse a transaction naming one item more than once.
 *
 * Unlike a batch, a transaction may name one table as often as it likes: what
 * it may not do is touch one item twice, whichever actions the two are. The
 * keys are the marshalled primary keys, so two actions on the same item are the
 * same text whichever attribute order they arrived in.
 */
function assertDistinctItems<Item extends SimDynamoDbTransactItem>(
  targets: readonly SimDynamoDbTransactTarget<Item>[],
): void {
  const seen = new Set<string>();

  for (const { item, table } of targets) {
    const key = `${table.tableName}: ${item.keyIn(table)}`;

    if (seen.has(key)) {
      throw new SimDynamoDbValidationException(
        `Transaction request cannot include multiple operations on one item: ` +
          `the table ${table.tableName} is named twice for the same item`,
      );
    }

    seen.add(key);
  }
}
