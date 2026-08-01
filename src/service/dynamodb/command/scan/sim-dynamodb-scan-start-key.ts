import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";
import type { SimDynamoDbReadView } from "../../table/sim-dynamodb-read-view.js";
import type { SimDynamoDbScanSegment } from "../../table/sim-dynamodb-scan-segment.js";
import type { SimDynamoDbTableScan } from "../../table/sim-dynamodb-table-scan.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";

interface SimDynamoDbScanStartKeyProperties {
  readonly view: SimDynamoDbReadView;
  readonly scan: SimDynamoDbTableScan;
  readonly segment: SimDynamoDbScanSegment;
  readonly exclusiveStartKey:
    Readonly<Record<string, SimDynamoDbAttributeValue>> | undefined;
}

/**
 * Read the key a scan resumes after, if the request carries one.
 *
 * The token a page hands out is the primary key of the item the walk stopped
 * on, so it is read back as a Key: the same rules apply as to the Key of a
 * GetItem, and an attribute that is not part of the primary key, a missing key
 * element or a type mismatch are refused the same way.
 *
 * A parallel scan adds one rule. The token has to name an item of the segment
 * being read, since a token from another segment names a place this walk never
 * reaches. Resuming a page on the wrong segment is the mistake parallel scan
 * code makes, so it is refused rather than quietly reading from the start.
 */
export function readSimDynamoDbScanStartKey(
  properties: SimDynamoDbScanStartKeyProperties,
): SimDynamoDbItem | undefined {
  const { view, scan, segment } = properties;
  const attributeValues = properties.exclusiveStartKey;

  if (attributeValues === undefined) {
    return undefined;
  }

  if (Object.keys(attributeValues).length === 0) {
    throw new SimDynamoDbValidationException(
      "An ExclusiveStartKey names the item to resume after, and this one " +
        "names no attribute at all",
    );
  }

  const startKey = SimDynamoDbItem.fromAttributeValues(attributeValues);

  // Reading the key through the view checks it against the key schema, which
  // is what makes a token DynamoDB would refuse refused here too.
  view.assertStartKey(startKey);

  if (!scan.positionOf(startKey).inSegment(segment)) {
    throw new SimDynamoDbValidationException(
      `The ExclusiveStartKey names an item of another segment than Segment ` +
        `${segment.index.toString()} of ` +
        `${segment.totalSegments.toString()}. A parallel scan resumes each ` +
        `segment with the token that segment handed out.`,
    );
  }

  return startKey;
}
