import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import type { SimDynamoDbItemChange } from "./sim-dynamodb-item-change.js";

/**
 * The images one stream record carries beyond its keys.
 */
export interface SimDynamoDbStreamImages {
  readonly newImage: SimDynamoDbItem | undefined;
  readonly oldImage: SimDynamoDbItem | undefined;
}

/**
 * Which images a record carries, which is the whole of what a view type does.
 *
 * The degenerate shapes are the point of reading this as a matrix rather than
 * as a choice per record: a removal on a `NEW_IMAGE` stream has no new image to
 * carry, and an insertion on an `OLD_IMAGE` stream has no old one, so both come
 * out as keys and nothing else. Real DynamoDB still writes those records, and
 * so does this, since the record is how a reader learns the change happened at
 * all.
 */
export function simDynamoDbStreamImages(
  change: SimDynamoDbItemChange,
  viewType: SimDynamoDbStreamViewType,
): SimDynamoDbStreamImages {
  switch (viewType) {
    case "KEYS_ONLY": {
      return { newImage: undefined, oldImage: undefined };
    }
    case "NEW_IMAGE": {
      return { newImage: change.newImage, oldImage: undefined };
    }
    case "OLD_IMAGE": {
      return { newImage: undefined, oldImage: change.oldImage };
    }
    case "NEW_AND_OLD_IMAGES": {
      return { newImage: change.newImage, oldImage: change.oldImage };
    }
  }
}
