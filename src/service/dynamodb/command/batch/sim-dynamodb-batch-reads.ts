import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { readSimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection-expression.js";
import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import { readSimDynamoDbKey } from "../item/sim-dynamodb-key-input.js";
import {
  simDynamoDbAttributesOf,
  simDynamoDbItemAttributeNames,
} from "../authorize/sim-dynamodb-attributes.js";
import type { SimDynamoDbKeysAndAttributes } from "./batch.command.js";
import { readSimDynamoDbBatchRequestItems } from "./sim-dynamodb-batch-request-items.js";
import { assertSimDynamoDbBatchReadLimit } from "./sim-dynamodb-batch-read-limit.js";
import { refuseUnsimulatedBatchKeysAndAttributes } from "./sim-dynamodb-unsimulated-batch-input.js";

const operation = "BatchGetItem";

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

  /** The top-level attributes this table is asked for, per table as above. */
  readonly attributes: readonly string[];
}

/**
 * Read every key a batch asks for, before any table is reached.
 *
 * A ProjectionExpression DynamoDB would refuse is refused whether or not the
 * keys hold anything, which is how the single item reads work too.
 */
export function readSimDynamoDbBatchReads(
  requestItems:
    | Readonly<Record<string, SimDynamoDbKeysAndAttributes>>
    | undefined,
): readonly SimDynamoDbBatchTableReads[] {
  const tables = readSimDynamoDbBatchRequestItems(requestItems, operation);

  assertSimDynamoDbBatchReadLimit(tables, operation);

  return tables.map(({ reference, requested }) => {
    const keys = readTableKeys(reference, requested);
    const read = readSimDynamoDbProjection(requested);

    return {
      reference,
      keys,
      projection: read.projection,
      attributes: simDynamoDbAttributesOf(
        read.attributes,
        simDynamoDbItemAttributeNames(() => keys),
      ),
    };
  });
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
