import type { SimDynamoDbTableReach } from "../table/sim-dynamodb-table-reach.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableWrite } from "../../table/sim-dynamodb-table-writes.js";

/**
 * One action of a transactional write.
 *
 * Every action knows the table it names, the IAM action it asks for, which item
 * of that table it works on, what has to hold for it, and what it does. Keeping
 * all of that here is what lets a transaction check every action before it
 * applies any of them, since the check and the write read the same item.
 */
export interface SimDynamoDbTransactWrite {
  /**
   * The table name or ARN this action names.
   */
  readonly reference: string | undefined;

  /**
   * The IAM action this one asks for.
   *
   * A transaction is authorized as the operations it is made of rather than as
   * itself, so a put in a transaction needs `dynamodb:PutItem` and a condition
   * check needs `dynamodb:ConditionCheckItem`.
   */
  readonly action: string;

  /**
   * What this action reaches, for the condition keys it is authorized with.
   */
  reach(): SimDynamoDbTableReach;

  /**
   * The bytes this action counts towards the size of the transaction.
   */
  sizeInBytes(): number;

  /**
   * The primary key this action works on, as the table marshals it.
   */
  keyIn(table: SimDynamoDbTable): string;

  /**
   * The item the table holds under this action's key, if any.
   */
  storedIn(table: SimDynamoDbTable): SimDynamoDbItem | undefined;

  /**
   * Refuse this action against the table it names, before anything is written.
   *
   * A condition that does not hold throws
   * `SimDynamoDbConditionalCheckFailedException`, which the transaction turns
   * into the cancellation reason for this action. Anything else the action asks
   * for and the table will not take is a `SimDynamoDbValidationException`, which
   * refuses the whole request rather than cancelling it.
   */
  assertApplicableTo(table: SimDynamoDbTable): void;

  /**
   * Work out the write this action makes, without making it.
   *
   * Anything the table would refuse the write for is refused here, so the
   * transaction can prepare every action before committing any of them.
   */
  prepareFor(table: SimDynamoDbTable): SimDynamoDbTableWrite;
}
