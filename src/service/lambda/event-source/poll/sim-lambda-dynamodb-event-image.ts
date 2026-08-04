import type {
  SimLambdaDynamoDbAttributeValue,
  SimLambdaDynamoDbImage,
} from "../stream/sim-lambda-dynamodb-attribute-value.js";
import type { SimLambdaEventSourceStreamRecordBody } from "../stream/sim-lambda-event-source-streams.js";
import type {
  SimLambdaDynamoDbEventAttributeValue,
  SimLambdaDynamoDbEventImage,
} from "./sim-lambda-dynamodb-stream-event.types.js";

/**
 * The images an event record carries, which are the ones the stream's view type
 * gave the record and no others.
 */
export function simLambdaDynamoDbEventImages(
  body: SimLambdaEventSourceStreamRecordBody | undefined,
): {
  readonly Keys?: SimLambdaDynamoDbEventImage;
  readonly NewImage?: SimLambdaDynamoDbEventImage;
  readonly OldImage?: SimLambdaDynamoDbEventImage;
} {
  return {
    ...(body?.Keys !== undefined && {
      Keys: simLambdaDynamoDbEventImage(body.Keys),
    }),
    ...(body?.NewImage !== undefined && {
      NewImage: simLambdaDynamoDbEventImage(body.NewImage),
    }),
    ...(body?.OldImage !== undefined && {
      OldImage: simLambdaDynamoDbEventImage(body.OldImage),
    }),
  };
}

/**
 * The image a stream record's item becomes in the event.
 *
 * Everything but binary crosses unchanged. Binary does not: the Streams API
 * hands out bytes, because its client decoded them, and a function receives the
 * base64 the event was written with. A handler doing `Buffer.from(value.B,
 * "base64")` works on AWS, so it has to work here, and bytes handed over
 * instead would make that same line quietly produce something else.
 */
export function simLambdaDynamoDbEventImage(
  image: SimLambdaDynamoDbImage,
): SimLambdaDynamoDbEventImage {
  return Object.fromEntries(
    Object.entries(image).map(([name, value]) => [
      name,
      eventAttributeValue(value),
    ]),
  );
}

/**
 * One value, with the binary inside it base64 encoded however deeply it is
 * nested: a list or a map carries attribute values of its own.
 */
function eventAttributeValue(
  value: SimLambdaDynamoDbAttributeValue,
): SimLambdaDynamoDbEventAttributeValue {
  if (value.B !== undefined) {
    return { B: base64Of(value.B) };
  }

  if (value.BS !== undefined) {
    return { BS: value.BS.map((member) => base64Of(member)) };
  }

  if (value.L !== undefined) {
    return { L: value.L.map((member) => eventAttributeValue(member)) };
  }

  if (value.M !== undefined) {
    return { M: simLambdaDynamoDbEventImage(value.M) };
  }

  return value;
}

function base64Of(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}
