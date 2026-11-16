import type { SimDynamoDbProjection } from "../../expression/projection/sim-dynamodb-projection.js";
import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbSelect } from "./sim-dynamodb-select.js";

interface SimDynamoDbReadSizeProperties {
  readonly view: SimDynamoDbReadView;
  readonly projection: SimDynamoDbProjection | undefined;
  readonly select: SimDynamoDbSelect;
}

/**
 * How many bytes one item adds to the data a Query or Scan page has read.
 *
 * An item counts as the view holds it, so a read of an index counts the
 * attributes the index projects. A read of a local secondary index that asks
 * for an attribute the index leaves out fetches the item from the base table,
 * and that item then counts whole.
 *
 * A fetch is recognised from what the read answers with (`Select` set to
 * `ALL_ATTRIBUTES`, or a `ProjectionExpression` reaching past the index). A
 * `FilterExpression` naming an unprojected attribute also fetches on AWS, and
 * is counted at the projected size here.
 */
export function simDynamoDbReadSize(
  properties: SimDynamoDbReadSizeProperties,
): (item: SimDynamoDbItem) => number {
  const { view, projection, select } = properties;

  return (item) => {
    const held = view.project(item);

    if (select.wholeItems || reachesPast(held, projection?.apply(item))) {
      return item.sizeInBytes();
    }

    return held.sizeInBytes();
  };
}

/**
 * Whether a projected item names an attribute the view's copy lacks.
 */
function reachesPast(
  held: SimDynamoDbItem,
  answered: SimDynamoDbItem | undefined,
): boolean {
  const names = answered?.attributeNames() ?? [];

  return names.some((name) => held.attribute(name) === undefined);
}
