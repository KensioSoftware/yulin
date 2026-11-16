import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimBatchGetItemCommand,
  SimBatchGetItemCommandOutput,
} from "./batch.command.js";
import { readSimDynamoDbBatchReads } from "./sim-dynamodb-batch-reads.js";
import { reachSimDynamoDbBatchTables } from "./sim-dynamodb-batch-tables.js";
import { refuseUnsimulatedBatchReadInput } from "./sim-dynamodb-unsimulated-batch-input.js";
import { simDynamoDbLeadingKeysOf } from "../authorize/sim-dynamodb-leading-keys.js";
import { SimDynamoDbBatchReadBudget } from "./sim-dynamodb-batch-read-budget.js";
import { readSimDynamoDbBatchTable } from "./sim-dynamodb-batch-table-read.js";
import {
  SimDynamoDbCapacityTally,
  simDynamoDbTableTarget,
} from "../../capacity/sim-dynamodb-capacity-tally.js";
import { SimDynamoDbReturnConsumedCapacity } from "../../capacity/sim-dynamodb-return-consumed-capacity.js";

interface SimDynamoDbBatchGetItemProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbBatchGetItemOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The BatchGetItem command.
 *
 * A batch reads items by primary key across tables in one call. Consistency and
 * projection are settled per table rather than per call, so one call can read
 * one table consistently and part of another.
 *
 * A key that holds nothing is left out of the answer rather than standing in it
 * as an empty item, so what came back is what was there.
 */
export class SimDynamoDbBatchGetItem {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbBatchGetItemProperties) {
    this.access = properties.access;
  }

  /**
   * Read every item a batch asks for.
   */
  handle(
    command: SimBatchGetItemCommand,
    options?: SimDynamoDbBatchGetItemOptions,
  ): SimBatchGetItemCommandOutput {
    const input = command.input;

    refuseUnsimulatedBatchReadInput(input);

    const reached = reachSimDynamoDbBatchTables(
      readSimDynamoDbBatchReads(input.RequestItems),
      {
        access: this.access,
        operation: "BatchGetItem",
        caller: options?.caller,
        reached: (entry) => ({
          leadingKeys: simDynamoDbLeadingKeysOf(() => entry.keys),
          attributes: entry.attributes,
        }),
      },
    );
    const budget = new SimDynamoDbBatchReadBudget();
    const read = reached.map((entry) =>
      readSimDynamoDbBatchTable(entry, budget),
    );

    return {
      Responses: Object.fromEntries(
        read.map((table) => [table.reference, table.items]),
      ),
      UnprocessedKeys: Object.fromEntries(
        read.flatMap(({ reference, unprocessed }) =>
          unprocessed === undefined ? [] : [[reference, unprocessed] as const],
        ),
      ),
      ...SimDynamoDbReturnConsumedCapacity.read(
        input.ReturnConsumedCapacity,
      ).each(() =>
        read.map(({ reference, readUnits }) => {
          const tally = new SimDynamoDbCapacityTally(reference);
          tally.read(simDynamoDbTableTarget, readUnits);

          return tally;
        }),
      ),
      $metadata: {},
    };
  }
}
