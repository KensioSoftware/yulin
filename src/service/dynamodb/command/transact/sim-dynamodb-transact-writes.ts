import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { assertSimDynamoDbTransactItemCount } from "./sim-dynamodb-transact-items.js";
import {
  readSimDynamoDbTransactWrite,
  type SimDynamoDbTransactWrite,
} from "./sim-dynamodb-transact-write.js";
import type { SimDynamoDbTransactWriteItem } from "./transact.command.js";

const operation = "TransactWriteItems";

/**
 * Real DynamoDB stops a transactional write at 4 MB of request.
 */
const greatestRequestBytes = 4 * 1024 * 1024;

/**
 * Read every action a transactional write asks for, before any table is
 * reached.
 *
 * Nothing here reaches a table. A transaction is applied whole or not at all,
 * so everything that can be checked without a table is checked first, and the
 * keys and conditions are checked against their tables after that.
 */
export function readSimDynamoDbTransactWrites(
  items: readonly SimDynamoDbTransactWriteItem[] | undefined,
): readonly SimDynamoDbTransactWrite[] {
  const requested = items ?? [];

  assertSimDynamoDbTransactItemCount(requested.length, operation);

  const writes = requested.map((item) => readSimDynamoDbTransactWrite(item));

  assertWithinSizeLimit(writes);

  return writes;
}

/**
 * Refuse a transaction carrying more than DynamoDB takes in one request.
 *
 * The bytes counted are the items and keys the actions carry, which is close to
 * the request size rather than equal to it. Real DynamoDB counts the JSON the
 * request arrived as, and that is bigger than the values inside it.
 */
function assertWithinSizeLimit(
  writes: readonly SimDynamoDbTransactWrite[],
): void {
  const total = writes.reduce((bytes, write) => bytes + write.sizeInBytes(), 0);

  if (total > greatestRequestBytes) {
    throw new SimDynamoDbValidationException(
      `Transaction request size has exceeded the maximum allowed size of ` +
        `${greatestRequestBytes.toString()} bytes, at ${total.toString()} bytes`,
    );
  }
}
