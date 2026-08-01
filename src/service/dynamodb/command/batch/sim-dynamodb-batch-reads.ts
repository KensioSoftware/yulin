import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import type { SimDynamoDbKeysAndAttributes } from "./batch.command.js";
import {
  readSimDynamoDbBatchRequestItems,
  type SimDynamoDbBatchTableRequest,
} from "./sim-dynamodb-batch-request-items.js";
import { refuseUnsimulatedBatchKeysAndAttributes } from "./sim-dynamodb-unsimulated-batch-input.js";

const operation = "BatchGetItem";

/**
 * Real DynamoDB reads 100 items in one batch, counted across every table the
 * request names rather than per table.
 */
const greatestKeys = 100;

/**
 * What a batch read asks one table for.
 *
 * The projection belongs to the table rather than to the request, so one call
 * can read the whole of one table's items and part of another's.
 */
export interface SimDynamoDbBatchTableReads {
  readonly reference: string;
  readonly keys: readonly SimDynamoDbItem[];
  readonly projection: SimDynamoDbProjection | undefined;
}

/**
 * Read every key a batch asks for, before any table is reached.
 *
 * A ProjectionExpression DynamoDB would refuse is refused whether or not the
 * keys hold anything, which is how the single item reads work too.
 */
export function readSimDynamoDbBatchReads(
  requestItems:
    Readonly<Record<string, SimDynamoDbKeysAndAttributes>> | undefined,
): readonly SimDynamoDbBatchTableReads[] {
  const tables = readSimDynamoDbBatchRequestItems(requestItems, operation);

  assertWithinKeyLimit(tables);

  return tables.map(({ reference, requested }) => ({
    reference,
    keys: readTableKeys(reference, requested),
    projection: readSimDynamoDbProjection(requested),
  }));
}

/**
 * Refuse a batch asking for more items than DynamoDB reads at once.
 */
function assertWithinKeyLimit(
  tables: readonly SimDynamoDbBatchTableRequest<SimDynamoDbKeysAndAttributes>[],
): void {
  const total = tables.reduce(
    (count, { requested }) => count + (requested.Keys ?? []).length,
    0,
  );

  if (total > greatestKeys) {
    throw new SimDynamoDbValidationException(
      `Too many items requested for the ${operation} call: ${total.toString()} ` +
        `keys, where ${greatestKeys.toString()} is the most a batch reads`,
    );
  }
}

/**
 * Read the keys one table of the batch is asked for.
 */
function readTableKeys(
  reference: string,
  requested: SimDynamoDbKeysAndAttributes,
): readonly SimDynamoDbItem[] {
  refuseUnsimulatedBatchKeysAndAttributes(requested);

  const keys = requested.Keys ?? [];

  if (keys.length === 0) {
    throw new SimDynamoDbValidationException(
      `${operation} names the table ${reference} with no Keys, and a batch ` +
        `names at least one for every table it reads`,
    );
  }

  return keys.map((key) => readSimDynamoDbKey(key));
}
