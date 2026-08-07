import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDbWriteRequest } from "./batch.command.js";
import {
  readSimDynamoDbBatchRequestItems,
  type SimDynamoDbBatchTableRequest,
} from "./sim-dynamodb-batch-request-items.js";
import {
  readSimDynamoDbBatchWrite,
  type SimDynamoDbBatchWrite,
} from "./sim-dynamodb-batch-write.js";

const operation = "BatchWriteItem";

/**
 * Real DynamoDB takes 25 put or delete requests in one batch, counted across
 * every table the request names rather than per table.
 */
const greatestWriteRequests = 25;

/**
 * The writes a batch asks one table for.
 */
export interface SimDynamoDbBatchTableWrites {
  readonly reference: string;
  readonly writes: readonly SimDynamoDbBatchWrite[];
}

/**
 * Read every write a batch asks for, before any of them is applied.
 *
 * Nothing here reaches a table. A batch write is refused whole rather than
 * partly applied, so everything that can be checked without a table is checked
 * first, and the keys are checked against their tables after that.
 */
export function readSimDynamoDbBatchWrites(
  requestItems:
    | Readonly<Record<string, readonly SimDynamoDbWriteRequest[]>>
    | undefined,
): readonly SimDynamoDbBatchTableWrites[] {
  const tables = readSimDynamoDbBatchRequestItems(requestItems, operation);

  assertWithinRequestLimit(tables);

  return tables.map(({ reference, requested }) => ({
    reference,
    writes: readTableWrites(reference, requested),
  }));
}

/**
 * Refuse a batch carrying more requests than DynamoDB writes at once.
 *
 * The count is checked before the requests are read, so a batch that is too
 * long is told so rather than being told about the first item in it that has
 * something else wrong.
 */
function assertWithinRequestLimit(
  tables: readonly SimDynamoDbBatchTableRequest<
    readonly SimDynamoDbWriteRequest[]
  >[],
): void {
  const total = tables.reduce(
    (count, { requested }) => count + requested.length,
    0,
  );

  if (total > greatestWriteRequests) {
    throw new SimDynamoDbValidationException(
      `Too many items requested for the ${operation} call: ${total.toString()} ` +
        `requests, where ${greatestWriteRequests.toString()} is the most a ` +
        `batch takes`,
    );
  }
}

/**
 * Read the writes one table of the batch asks for.
 */
function readTableWrites(
  reference: string,
  requests: readonly SimDynamoDbWriteRequest[],
): readonly SimDynamoDbBatchWrite[] {
  if (requests.length === 0) {
    throw new SimDynamoDbValidationException(
      `${operation} names the table ${reference} with no write requests, and ` +
        `a batch names at least one for every table it works on`,
    );
  }

  return requests.map((request) => readSimDynamoDbBatchWrite(request));
}
