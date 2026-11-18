import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { assertSimDynamoDbTransactItemCount } from "./sim-dynamodb-transact-items.js";
import { SimDynamoDbTransactRead } from "./sim-dynamodb-transact-read.js";
import type { SimDynamoDbTransactGetItem } from "./transact.command.js";

const operation = "TransactGetItems";

/**
 * Read every Get a transactional read asks for, before any table is reached.
 *
 * A ProjectionExpression DynamoDB would refuse is refused whether or not the
 * keys hold anything, which is how the other reads work too.
 */
export function readSimDynamoDbTransactGets(
  items: readonly SimDynamoDbTransactGetItem[] | undefined,
): readonly SimDynamoDbTransactRead[] {
  const requested = items ?? [];

  assertSimDynamoDbTransactItemCount(requested.length, operation);

  return requested.map((item) => readGet(item));
}

/**
 * Read one entry of a transactional read.
 *
 * A TransactGetItem carries a Get and nothing else, so an entry without one is
 * refused rather than read as an empty request.
 */
function readGet(item: SimDynamoDbTransactGetItem): SimDynamoDbTransactRead {
  if (item.Get === undefined) {
    throw new SimDynamoDbValidationException(
      "A TransactGetItem carries a Get, and this one carries none",
    );
  }

  return SimDynamoDbTransactRead.of(item.Get);
}
