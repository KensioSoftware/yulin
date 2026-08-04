import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import type {
  SimDynamoDbStreamSpecification,
  SimDynamoDbStreamViewType,
} from "./sim-dynamodb-stream.types.js";
import { readSimDynamoDbStreamViewType } from "./sim-dynamodb-stream-view-type.js";

/**
 * What a request asks a table's stream to be, once it has been checked.
 *
 * A view type is there when the stream is being switched on, and never when it
 * is being switched off, since the view type belongs to the stream rather than
 * to the table. The two shapes are one type rather than two so that a request
 * carrying a StreamSpecification is one thing to read and one thing to apply.
 */
export type SimDynamoDbStreamRequest =
  | { readonly enabled: true; readonly viewType: SimDynamoDbStreamViewType }
  | { readonly enabled: false };

/**
 * Read the StreamSpecification a CreateTable or UpdateTable request carries.
 *
 * Nothing here knows about the table, so nothing here refuses a request for the
 * stream the table already has. This is only the request read on its own: what
 * it asks for, and whether it asks for it coherently.
 *
 * `StreamEnabled` is required whenever the specification is there at all, as it
 * is on real DynamoDB. A specification carrying only a view type would read as
 * a request for a stream while making a table with none.
 */
export function readSimDynamoDbStreamSpecification(
  input: SimDynamoDbStreamSpecification | undefined,
): SimDynamoDbStreamRequest | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input.StreamEnabled === undefined) {
    throw new SimDynamoDbValidationException(
      "One or more parameter values were invalid: StreamEnabled is required " +
        "in a StreamSpecification",
    );
  }

  if (!input.StreamEnabled) {
    return { enabled: false };
  }

  return {
    enabled: true,
    viewType: readSimDynamoDbStreamViewType(input.StreamViewType),
  };
}
