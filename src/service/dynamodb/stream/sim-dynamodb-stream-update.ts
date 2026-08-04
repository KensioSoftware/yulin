import type { SimUpdateTableCommandInput } from "../command/table/table.command.js";
import { SimDynamoDbValidationException } from "../error/dynamodb.error.js";
import {
  readSimDynamoDbStreamSpecification,
  type SimDynamoDbStreamRequest,
} from "./sim-dynamodb-stream-specification.js";
import type { SimDynamoDbTableStream } from "./sim-dynamodb-table-stream.js";

/**
 * Refuse a request to switch on a stream the table already has.
 *
 * A stream's view type is fixed for the life of the stream, so there is no such
 * thing as changing it in place: what an application wants is a new stream, and
 * AWS makes it ask for one by switching this one off first. The refusal says so
 * rather than leaving a reader to work out why the obvious request failed.
 */
function refuseSecondStream(
  request: SimDynamoDbStreamRequest,
  stream: SimDynamoDbTableStream,
): void {
  const current = stream.current;

  if (current === undefined || !request.enabled) {
    return;
  }

  if (request.viewType === current.viewType) {
    throw new SimDynamoDbValidationException(
      "Table already has an enabled stream",
    );
  }

  throw new SimDynamoDbValidationException(
    `Table already has an enabled stream, and a stream's StreamViewType ` +
      `cannot be changed in place: switch the ${current.viewType} stream off ` +
      `and on again to get a ${request.viewType} one`,
  );
}

/**
 * Refuse a request to switch off a stream the table does not have.
 */
function refuseAbsentStream(
  request: SimDynamoDbStreamRequest,
  stream: SimDynamoDbTableStream,
): void {
  if (!request.enabled && stream.current === undefined) {
    throw new SimDynamoDbValidationException(
      "Table does not have an enabled stream to disable",
    );
  }
}

/**
 * Read the change an UpdateTable request asks a table's stream for.
 *
 * Unlike CreateTable, where a stream specification describes a table that does
 * not exist yet, this is read against the stream the table already has. A
 * request that asks for the state the table is already in is refused rather
 * than accepted as a no-op, which is what real DynamoDB does with both of them.
 */
export function readSimDynamoDbStreamUpdate(
  input: SimUpdateTableCommandInput,
  stream: SimDynamoDbTableStream,
): SimDynamoDbStreamRequest | undefined {
  const request = readSimDynamoDbStreamSpecification(input.StreamSpecification);

  if (request === undefined) {
    return undefined;
  }

  refuseSecondStream(request, stream);
  refuseAbsentStream(request, stream);

  return request;
}
