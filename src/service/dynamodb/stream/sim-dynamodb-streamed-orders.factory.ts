import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbStream } from "./sim-dynamodb-stream.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * What a test asks for when it wants a stream with records already on it.
 */
export interface SimDynamoDbStreamedOrdersInput {
  readonly tableName: string;
  readonly viewType: SimDynamoDbStreamViewType;

  /**
   * How many orders to write, which is how many records the stream takes.
   */
  readonly orders: number;
}

/**
 * Creates a stream that has already captured a number of item writes.
 *
 * The orders are written one at a time through PutItem, so the stream takes
 * them in the order their identifiers count up and a test can name the record
 * it means by position.
 *
 * ```typescript
 * const stream = await simDynamoDbStreamedOrdersFactory.make(
 *   { orders: 3 },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbStreamedOrdersFactory = new AsyncMappedFactory<
  SimDynamoDbStreamedOrdersInput,
  SimDynamoDbStream,
  SimAws
>(
  () => ({ tableName: "orders", viewType: "NEW_AND_OLD_IMAGES", orders: 1 }),
  async (input, simAws) => {
    const table = await simDynamoDbStreamedTableFactory.make(
      { tableName: input.tableName, viewType: input.viewType },
      simAws,
    );

    for (let order = 1; order <= input.orders; order += 1) {
      // oxlint-disable-next-line no-await-in-loop
      await simAws.dynamoDb().putItem({
        input: {
          TableName: input.tableName,
          Item: { orderId: { S: `order-${order.toString()}` } },
        },
      });
    }

    const stream = table.stream.latest;
    assertDefined(stream, "DynamoDB table stream");

    return stream;
  },
);
