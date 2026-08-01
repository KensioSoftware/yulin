import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbTable } from "../../table/sim-dynamodb-table.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type {
  SimBatchGetItemCommand,
  SimBatchGetItemCommandOutput,
} from "./batch.command.js";
import {
  readSimDynamoDbBatchReads,
  type SimDynamoDbBatchTableReads,
} from "./sim-dynamodb-batch-reads.js";
import { assertDistinctBatchItems } from "./sim-dynamodb-batch-request-items.js";
import { refuseUnsimulatedBatchReadInput } from "./sim-dynamodb-unsimulated-batch-input.js";

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

    const requested = readSimDynamoDbBatchReads(input.RequestItems);
    const responses = Object.fromEntries(
      requested.map((table) => [
        table.reference,
        this.read(table, options?.caller),
      ]),
    );

    // Nothing here throttles or stops at a response size, so no key is ever
    // left unread. The map is still answered with, since that is the shape a
    // retry loop reads.
    return { Responses: responses, UnprocessedKeys: {}, $metadata: {} };
  }

  /**
   * Read what one table of the batch was asked for.
   *
   * DynamoDB reads a batch in parallel and answers in no particular order. The
   * items here come back in the order their keys were named, which is one of
   * the orders that is allowed rather than one that can be relied on.
   */
  private read(
    requested: SimDynamoDbBatchTableReads,
    caller: SimAwsCaller | undefined,
  ): readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[] {
    const table = this.access.required(
      "dynamodb:BatchGetItem",
      requested.reference,
      caller,
    );

    // Marshalling every key checks it against the table's key schema, and is
    // what tells two reads of one item apart.
    assertDistinctBatchItems(
      requested.keys.map((key) => table.keyOfKey(key)),
      requested.reference,
      "BatchGetItem",
    );

    return requested.keys
      .map((key) => this.found(table, key, requested))
      .filter((item) => item !== undefined);
  }

  /**
   * Read one item, as the table it is in and the projection asked for it.
   */
  private found(
    table: SimDynamoDbTable,
    key: SimDynamoDbItem,
    requested: SimDynamoDbBatchTableReads,
  ): Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined {
    const item = table.getItem(key);

    if (item === undefined) {
      return undefined;
    }

    return (requested.projection?.apply(item) ?? item).toAttributeValues();
  }
}
