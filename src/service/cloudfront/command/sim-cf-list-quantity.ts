import { isRecord } from "../../../util/type-guard/record.js";
import { SimCloudFrontInconsistentQuantities } from "../error/sim-cloudfront.error.js";

/**
 * Refuse a CloudFront list whose `Quantity` disagrees with its `Items`.
 *
 * Every CloudFront list carries both a count and the items, and CloudFront
 * refuses a request where they disagree. The count is easy to get wrong by hand
 * and nothing else catches it: a `Quantity` of 0 alongside one item would
 * otherwise create the item, and a `Quantity` of 1 alongside none would create
 * nothing, either way deploying something the caller did not describe.
 *
 * A list arriving as a plain array carries no count to disagree with. That is
 * the CloudFormation shape, where the property is an array rather than the pair,
 * so there is nothing to check.
 *
 * A record with no `Quantity` at all is accepted rather than refused. The AWS
 * SDK types make omitting it a compile error, so what reaches here without one
 * is a hand-written `{ Items: [...] }`, and refusing that would be stricter
 * than the mistake is worth.
 */
export function assertConsistentQuantity(
  listName: string,
  value: unknown,
): void {
  if (!isRecord(value)) {
    return;
  }

  const quantity = value["Quantity"];

  if (typeof quantity !== "number") {
    return;
  }

  const items = value["Items"];
  const itemCount = Array.isArray(items) ? items.length : 0;

  if (quantity !== itemCount) {
    throw new SimCloudFrontInconsistentQuantities(
      `CloudFront ${listName} has Quantity ${String(quantity)} and ` +
        `${String(itemCount)} Items`,
    );
  }
}
