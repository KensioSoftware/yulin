import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimBatchWriteItemCommand,
  SimBatchWriteItemCommandOutput,
} from "./batch.command.js";
import { assertDistinctBatchItems } from "./sim-dynamodb-batch-request-items.js";
import { reachSimDynamoDbBatchTables } from "./sim-dynamodb-batch-tables.js";
import { readSimDynamoDbBatchWrites } from "./sim-dynamodb-batch-writes.js";
import { refuseUnsimulatedBatchWriteInput } from "./sim-dynamodb-unsimulated-batch-input.js";

const operation = "BatchWriteItem";

interface SimDynamoDbBatchWriteItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbBatchWriteItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The BatchWriteItem command.
 *
 * A batch puts and deletes items across tables in one call. Each put is a whole
 * replacement, as PutItem is, and each delete names a key, so deleting a key
 * that is already free succeeds. Neither reports the item it wrote over.
 *
 * A batch write is refused whole rather than partly applied: everything is
 * read, every table reached and every key checked before the first item is
 * written, so a request DynamoDB would reject leaves the tables as they were.
 */
export class SimDynamoDbBatchWriteItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbBatchWriteItemProperties) {
    this.access = properties.access;
  }

  /**
   * Apply every put and delete a batch asks for.
   */
  handle(
    command: SimBatchWriteItemCommand,
    options?: SimDynamoDbBatchWriteItemOptions,
  ): SimBatchWriteItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedBatchWriteInput(input);

    const reached = reachSimDynamoDbBatchTables(
      readSimDynamoDbBatchWrites(input.RequestItems),
      { access: this.access, operation, caller: options?.caller },
    );

    // Marshalling every key checks it against the table's key schema, and is
    // what tells two operations on one item apart. Every table is checked
    // before any of them is written to.
    for (const { table, requested } of reached) {
      assertDistinctBatchItems(
        requested.writes.map((write) => write.keyIn(table)),
        requested.reference,
        operation,
      );
    }

    for (const { table, requested } of reached) {
      for (const write of requested.writes) {
        write.applyTo(table);
      }
    }

    // Nothing here throttles, so nothing is ever left unprocessed. The map is
    // still answered with, since that is the shape a retry loop reads.
    return { UnprocessedItems: {}, $metadata: {} };
  }
}
