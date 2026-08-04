import { simDynamoDbBinaryText } from "../item/sim-dynamodb-binary.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";
import { simDynamoDbTextSize } from "../item/sim-dynamodb-value-size.js";
import type { SimDynamoDbValue } from "../item/sim-dynamodb-value.js";

/**
 * The bytes one value counts towards a stream record's size.
 *
 * This is not `simDynamoDbValueSize`, and the difference is deliberate. That
 * one implements the 400 KB item rule, where a number costs
 * `ceil(significantDigits / 2) + 1` and a list or a map carries three bytes of
 * overhead. A stream record is measured as the text it carries instead, so an
 * eight digit number costs 8 here and 5 there. The two agree on AWS's own
 * published samples only because `101` is three characters either way.
 *
 * A boolean and a null are the text the record carries them as, `true` or
 * `false`, and a collection is its elements with no overhead. AWS publishes no
 * sample covering those, so they follow the same rule the rest do rather than
 * inventing a second one.
 */
function streamValueSize(value: SimDynamoDbValue): number {
  switch (value.kind) {
    case "S": {
      return simDynamoDbTextSize(value.text);
    }
    case "N": {
      return simDynamoDbTextSize(value.number.text);
    }
    case "B": {
      return simDynamoDbTextSize(simDynamoDbBinaryText(value.bytes));
    }
    case "BOOL": {
      return simDynamoDbTextSize(String(value.boolean));
    }
    case "NULL": {
      return simDynamoDbTextSize("true");
    }
    case "SS": {
      return value.texts.reduce(
        (total, text) => total + simDynamoDbTextSize(text),
        0,
      );
    }
    case "NS": {
      return value.numbers.reduce(
        (total, number) => total + simDynamoDbTextSize(number.text),
        0,
      );
    }
    case "BS": {
      return value.bytes.reduce(
        (total, bytes) =>
          total + simDynamoDbTextSize(simDynamoDbBinaryText(bytes)),
        0,
      );
    }
    case "L": {
      return value.values.reduce(
        (total, element) => total + streamValueSize(element),
        0,
      );
    }
    case "M": {
      return value.entries
        .entries()
        .reduce(
          (total, [name, element]) =>
            total + simDynamoDbTextSize(name) + streamValueSize(element),
          0,
        );
    }
  }
}

/**
 * The bytes one image counts towards a stream record's size.
 */
function streamImageSize(image: SimDynamoDbItem): number {
  return image
    .entries()
    .entries()
    .reduce(
      (total, [name, value]) =>
        total + simDynamoDbTextSize(name) + streamValueSize(value),
      0,
    );
}

/**
 * The `SizeBytes` of a stream record carrying these images.
 *
 * Every image the record carries counts, together rather than one at a time:
 * the keys, and then whichever of the old and new images the view type
 * selected. A record carrying both images is close to twice the size of one
 * carrying either, which is what AWS's published samples show.
 */
export function simDynamoDbStreamRecordSize(
  images: readonly SimDynamoDbItem[],
): number {
  return images.reduce((total, image) => total + streamImageSize(image), 0);
}
