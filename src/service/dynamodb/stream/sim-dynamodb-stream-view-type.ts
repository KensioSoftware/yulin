import type { SimDynamoDbStreamViewType } from "./sim-dynamodb-stream.types.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";

/**
 * Every view type a stream can be enabled with.
 *
 * The keys of the changed item are on every record whichever of these a stream
 * was enabled with, so `KEYS_ONLY` is the floor rather than an exception.
 */
const streamViewTypes: readonly SimDynamoDbStreamViewType[] = [
  "KEYS_ONLY",
  "NEW_IMAGE",
  "OLD_IMAGE",
  "NEW_AND_OLD_IMAGES",
];

/**
 * Whether some text names a view type.
 */
function isStreamViewType(value: string): value is SimDynamoDbStreamViewType {
  return streamViewTypes.includes(value as SimDynamoDbStreamViewType);
}

/**
 * Read the view type a stream is being enabled with.
 *
 * A stream that is on has one: a record with no view type would be a record
 * with no rule about which images it carries. Real DynamoDB requires it the
 * same way, so a request leaving it out is refused rather than defaulted.
 */
export function readSimDynamoDbStreamViewType(
  value: string | undefined,
): SimDynamoDbStreamViewType {
  if (value === undefined) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: StreamViewType is " +
        "required when StreamEnabled is true",
    );
  }

  if (!isStreamViewType(value)) {
    throw new SimDynamoDbValidationException(
      `One or more parameter values were invalid: Unknown StreamViewType ` +
        `${value}, expected one of ${streamViewTypes.join(", ")}`,
    );
  }

  return value;
}
