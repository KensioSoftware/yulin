import type { SimDynamoDbAttributeValue } from "../command/item/item.types.js";

/**
 * One order of a locally indexed table, before it is written as an item.
 *
 * An order with no `placedAt` is not in the index, which is what makes a local
 * secondary index sparse the same way a global one is.
 */
interface SimDynamoDbLocallyIndexedOrder {
  readonly customerId: string;
  readonly orderId: string;
  readonly placedAt?: string;
}

/**
 * The orders a locally indexed table holds.
 *
 * The months run out of order against the order ids, so the index reads a
 * customer's orders in an order the table's own sort key does not give. One
 * month repeats within a customer, so two index entries share a whole index key
 * and only the table sort key separates them.
 */
const orders: readonly SimDynamoDbLocallyIndexedOrder[] = [
  { customerId: "customer-1", orderId: "order-01", placedAt: "2026-03" },
  { customerId: "customer-1", orderId: "order-02", placedAt: "2026-01" },
  { customerId: "customer-1", orderId: "order-03" },
  { customerId: "customer-1", orderId: "order-04", placedAt: "2026-01" },
  { customerId: "customer-2", orderId: "order-05", placedAt: "2026-03" },
  { customerId: "customer-2", orderId: "order-06" },
];

/**
 * The item one order is written as.
 *
 * `title` is on every order and in no key, so it is the attribute a test names
 * to find out whether a read reached the base table.
 */
function orderItem(
  order: SimDynamoDbLocallyIndexedOrder,
): Readonly<Record<string, SimDynamoDbAttributeValue>> {
  const item = {
    customerId: { S: order.customerId },
    orderId: { S: order.orderId },
    title: { S: `Order ${order.orderId}` },
  };

  if (order.placedAt === undefined) {
    return item;
  }

  return { ...item, placedAt: { S: order.placedAt } };
}

/**
 * The orders a locally indexed table holds, as the items they are written as.
 */
export function simDynamoDbLocallyIndexedOrders(): readonly Readonly<
  Record<string, SimDynamoDbAttributeValue>
>[] {
  return orders.map((order) => orderItem(order));
}
