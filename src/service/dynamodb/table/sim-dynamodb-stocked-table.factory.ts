import { AsyncMappedFactory } from "@kensio/part-factory";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";
import { simDynamoDbCollectionTableFactory } from "./sim-dynamodb-collection-table.factory.js";
import type { SimDynamoDbTable } from "./sim-dynamodb-table.js";

/**
 * What a test asks for when it wants a table with items already in it.
 *
 * The customers and orders are counts rather than the values themselves, so a
 * test asking for fewer than the default gets fewer rather than the first few
 * defaults with its own in place of them.
 */
export interface SimDynamoDbStockedTableInput {
  readonly tableName: string;
  readonly customerCount: number;
  readonly orderCount: number;
}

/**
 * The customers a stocked table holds orders for, so a test can name them.
 */
export function simDynamoDbStockedCustomerIds(
  customerCount: number,
): readonly string[] {
  return Array.from(
    { length: customerCount },
    (_, customer) => `c-${(customer + 1).toString()}`,
  );
}

/**
 * The orders a stocked table holds for each customer.
 */
function orderIds(orderCount: number): readonly string[] {
  return Array.from(
    { length: orderCount },
    (_, order) => `2026-${(order + 1).toString().padStart(2, "0")}`,
  );
}

/**
 * The status the order in one place of the table carries.
 *
 * Statuses alternate over the table as a whole, so a read filtering by one has
 * something to keep and something to drop however few orders a test asks for,
 * and a table of one order per customer alternates by customer.
 */
function orderStatus(position: number): string {
  if (position % 2 === 0) {
    return "OPEN";
  }

  return "SHIPPED";
}

/**
 * One order a stocked table holds, as the item it is written as.
 */
function orderItem(
  customerId: string,
  orderId: string,
  position: number,
): Readonly<Record<string, SimDynamoDbAttributeValue>> {
  return {
    customerId: { S: customerId },
    orderId: { S: orderId },
    status: { S: orderStatus(position) },
    total: { N: (position + 1).toString() },
  };
}

/**
 * Creates a table keyed by customer and order, holding one item per pair.
 *
 * This is the table a Scan reads: several item collections rather than one, so
 * a walk of the whole table has more than one partition key value to put in
 * order. Use `simDynamoDbCollectionTableFactory` for the same table with
 * nothing written to it.
 *
 * Each order carries a `status` of `OPEN` or `SHIPPED`, alternating over the
 * table, and a `total` counting up from 1 in the same order. Both are there so
 * a read can filter, project or compare by something outside the key.
 *
 * The orders are written together rather than in order, so the order a scan
 * answers in is the table's rather than the order they arrived in.
 *
 * ```typescript
 * const table = await simDynamoDbStockedTableFactory.make(
 *   { customerCount: 20 },
 *   simAws,
 * );
 * ```
 */
export const simDynamoDbStockedTableFactory = new AsyncMappedFactory<
  SimDynamoDbStockedTableInput,
  SimDynamoDbTable,
  SimAws
>(
  () => ({
    tableName: "OrdersTable",
    customerCount: 3,
    orderCount: 2,
  }),
  async (input, simAws) => {
    const table = await simDynamoDbCollectionTableFactory.make(
      { tableName: input.tableName },
      simAws,
    );
    const simDynamoDb = simAws.dynamoDb();
    const orders = orderIds(input.orderCount);

    await Promise.all(
      simDynamoDbStockedCustomerIds(input.customerCount).flatMap(
        (customerId, customer) =>
          orders.map(async (orderId, order) =>
            simDynamoDb.putItem({
              input: {
                TableName: input.tableName,
                Item: orderItem(
                  customerId,
                  orderId,
                  customer * orders.length + order,
                ),
              },
            }),
          ),
      ),
    );

    return table;
  },
);
