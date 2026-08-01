import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";

/**
 * The status the order in one place of the table carries.
 */
function statusAt(position: number): string {
  if (position % 2 === 0) {
    return "OPEN";
  }

  return "SHIPPED";
}

/**
 * Whether the order in one place of the table is written without a status.
 */
function isDraft(position: number): boolean {
  return position % 3 === 2;
}

/**
 * The orders an indexed table holds, as the items they are written as.
 *
 * Every third order carries no `status`, so the index is missing it and a test
 * has something the table holds and the index does not. The statuses that are
 * there repeat, so the index holds several items under one partition key, and
 * `shippedAt` repeats within a status so two index entries share a whole index
 * key and only the table key separates them.
 */
export function simDynamoDbIndexedOrders(
  orderCount: number,
): readonly Readonly<Record<string, SimDynamoDbAttributeValue>>[] {
  return Array.from({ length: orderCount }, (_unused, position) => {
    const orderId = `order-${(position + 1).toString().padStart(2, "0")}`;
    const order = { orderId: { S: orderId }, title: { S: `Order ${orderId}` } };

    if (isDraft(position)) {
      return order;
    }

    const shippedMonth = (Math.floor(position / 4) + 1).toString();

    return {
      ...order,
      status: { S: statusAt(position) },
      shippedAt: { S: `2026-0${shippedMonth}` },
    };
  });
}
