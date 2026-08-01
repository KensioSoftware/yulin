import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { readSimDynamoDbKeyCondition } from "../../expression/key-condition/sim-dynamodb-key-condition-expression.js";
import { SimDynamoDbItemPage } from "../item/sim-dynamodb-item-page.js";
import type { SimDynamoDbTableAccess } from "../table/sim-dynamodb-table-access.js";
import type {
  SimQueryCommand,
  SimQueryCommandOutput,
} from "./query.command.js";
import { refuseSimDynamoDbQuerySegment } from "./sim-dynamodb-query-segment.js";
import { readSimDynamoDbQueryStartKey } from "./sim-dynamodb-query-start-key.js";
import { refuseUnsimulatedQueryInput } from "./sim-dynamodb-unsimulated-query-input.js";

interface SimDynamoDbQueryProperties {
  readonly access: SimDynamoDbTableAccess;
}

interface SimDynamoDbQueryOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The Query command.
 *
 * A query reads one item collection: the items under one partition key, in sort
 * key order. That is the whole of it, and it is why the key condition is a
 * closed grammar rather than the general condition grammar.
 */
export class SimDynamoDbQuery {
  private readonly access: SimDynamoDbTableAccess;

  constructor(properties: SimDynamoDbQueryProperties) {
    this.access = properties.access;
  }

  /**
   * Read a page of the item collection a key condition names.
   */
  handle(
    command: SimQueryCommand,
    options?: SimDynamoDbQueryOptions,
  ): SimQueryCommandOutput {
    const input = command.input;

    refuseUnsimulatedQueryInput(input);
    refuseSimDynamoDbQuerySegment(input);

    // The key condition is read before the table is reached, so an expression
    // DynamoDB would refuse is refused whether or not the table is there. What
    // is left is the part that needs the key schema, which is read once the
    // table has been found.
    const terms = readSimDynamoDbKeyCondition(input);
    const table = this.access.required(
      "dynamodb:Query",
      input.TableName,
      options?.caller,
    );
    const keyCondition = terms.forTable(table);

    // The token names an item of the collection being read, so it can only be
    // checked once that collection is known.
    const after = readSimDynamoDbQueryStartKey({
      table,
      keyCondition,
      exclusiveStartKey: input.ExclusiveStartKey,
    });

    const page = new SimDynamoDbItemPage({
      items: table.itemCollection(keyCondition).walk({
        forward: input.ScanIndexForward ?? true,
        after,
      }),
      limit: input.Limit,
      keySchema: table.keySchema,
    });

    return {
      Items: page.items.map((item) => item.toAttributeValues()),
      // Nothing filters a query yet, so every item the walk evaluated is an
      // item the page carries.
      Count: page.items.length,
      ScannedCount: page.items.length,
      LastEvaluatedKey: page.lastEvaluatedKey,
      $metadata: {},
    };
  }
}
