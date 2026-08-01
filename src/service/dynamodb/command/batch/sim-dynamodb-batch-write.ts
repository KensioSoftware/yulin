import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import type {
  SimDynamoDbDeleteRequest,
  SimDynamoDbPutRequest,
  SimDynamoDbWriteRequest,
} from "./batch.command.js";

/**
 * One put or delete a batch write asks for.
 *
 * Every write knows two things: which item of a table it works on, and what it
 * does to that table. Keeping both here is what lets a batch check its keys
 * before it applies anything, since the check and the write read the same item.
 */
export interface SimDynamoDbBatchWrite {
  /**
   * The primary key this write works on, as the table marshals it.
   */
  keyIn(table: SimDynamoDbTable): string;

  /**
   * Apply this write to the table.
   */
  applyTo(table: SimDynamoDbTable): void;
}

/**
 * A put in a batch write, which replaces the whole item as PutItem does.
 */
class SimDynamoDbBatchPut implements SimDynamoDbBatchWrite {
  private readonly item: SimDynamoDbItem;

  constructor(item: SimDynamoDbItem) {
    this.item = item;
  }

  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfItem(this.item);
  }

  applyTo(table: SimDynamoDbTable): void {
    table.putItem(this.item);
  }
}

/**
 * A delete in a batch write, which names a key rather than an item, so a key
 * that is already free is deleted successfully.
 */
class SimDynamoDbBatchDelete implements SimDynamoDbBatchWrite {
  private readonly key: SimDynamoDbItem;

  constructor(key: SimDynamoDbItem) {
    this.key = key;
  }

  keyIn(table: SimDynamoDbTable): string {
    return table.keyOfKey(this.key);
  }

  applyTo(table: SimDynamoDbTable): void {
    table.deleteItem(this.key);
  }
}

/**
 * Read one entry of a batch write.
 *
 * A WriteRequest carries exactly one of a PutRequest and a DeleteRequest. Both
 * or neither is refused rather than guessed at, since either guess would write
 * something the request did not ask for.
 */
export function readSimDynamoDbBatchWrite(
  request: SimDynamoDbWriteRequest,
): SimDynamoDbBatchWrite {
  const { PutRequest: put, DeleteRequest: remove } = request;

  if (put !== undefined && remove !== undefined) {
    throw new SimDynamoDbValidationException(
      "A WriteRequest carries exactly one of PutRequest and DeleteRequest, " +
        "and this one carries both",
    );
  }

  if (put !== undefined) {
    return new SimDynamoDbBatchPut(readPutItem(put));
  }

  if (remove !== undefined) {
    return new SimDynamoDbBatchDelete(readDeleteKey(remove));
  }

  throw new SimDynamoDbValidationException(
    "A WriteRequest carries exactly one of PutRequest and DeleteRequest, and " +
      "this one carries neither",
  );
}

/**
 * Read the item a batch put writes.
 */
function readPutItem(request: SimDynamoDbPutRequest): SimDynamoDbItem {
  assertUnconditional(request.ConditionExpression, "PutRequest");

  if (request.Item === undefined) {
    throw new SimDynamoDbValidationException("A PutRequest requires an Item");
  }

  return SimDynamoDbItem.fromAttributeValues(request.Item);
}

/**
 * Read the key a batch delete removes.
 */
function readDeleteKey(request: SimDynamoDbDeleteRequest): SimDynamoDbItem {
  assertUnconditional(request.ConditionExpression, "DeleteRequest");

  return readSimDynamoDbKey(request.Key);
}

/**
 * Refuse a condition on one entry of a batch.
 *
 * Real DynamoDB has no ConditionExpression on a batch write request at all: a
 * batch trades the conditions of PutItem and DeleteItem for writing 25 items at
 * once. A condition that was never evaluated would let a write through that
 * DynamoDB would have turned away, so it is refused rather than dropped.
 */
function assertUnconditional(
  expression: string | undefined,
  parameter: string,
): void {
  if (expression !== undefined) {
    throw new SimDynamoDbValidationException(
      `A ${parameter} takes no ConditionExpression: a batch write is ` +
        `unconditional, so PutItem, DeleteItem or UpdateItem is where a ` +
        `condition belongs`,
    );
  }
}
