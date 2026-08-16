import type { DeepPartialObject } from "@kensio/part-factory";

import type {
  SimLambdaDynamoDbEventImage,
  SimLambdaDynamoDbStreamEventRecord,
} from "../event-source/poll/sim-lambda-dynamodb-stream-event.types.js";

type StreamRecordOverrides =
  DeepPartialObject<SimLambdaDynamoDbStreamEventRecord>;

/**
 * The images one record carries, which is what the change is.
 */
interface StreamRecordImages {
  readonly Keys: SimLambdaDynamoDbEventImage;
  readonly NewImage?: SimLambdaDynamoDbEventImage;
  readonly OldImage?: SimLambdaDynamoDbEventImage;
}

/**
 * The change a made record reports, with the images and the view type that go
 * with it.
 */
export interface StreamRecordChange {
  readonly eventName: string;
  readonly images: StreamRecordImages;
  readonly streamViewType: string;
}

const keys: SimLambdaDynamoDbEventImage = { orderId: { S: "YL-1" } };
const placedOrder: SimLambdaDynamoDbEventImage = {
  orderId: { S: "YL-1" },
  status: { S: "placed" },
};
const shippedOrder: SimLambdaDynamoDbEventImage = {
  orderId: { S: "YL-1" },
  status: { S: "shipped" },
};

/**
 * Work out the change a record reports from what a test said about it.
 *
 * An `INSERT` carries a new image, a `REMOVE` an old one and a `MODIFY` both,
 * because that is what each of them means, and a record whose images disagree
 * with its event name is one no stream delivers. The view type then names the
 * images the record ends up carrying, including any the test supplied itself.
 */
export function streamRecordChange(
  overrides: StreamRecordOverrides,
): StreamRecordChange {
  const eventName = overrides.eventName ?? "INSERT";
  const body = overrides.dynamodb ?? {};
  const carriesNew = carriesImage(
    Object.hasOwn(body, "NewImage"),
    body.NewImage,
    eventName !== "REMOVE",
  );
  const carriesOld = carriesImage(
    Object.hasOwn(body, "OldImage"),
    body.OldImage,
    eventName !== "INSERT",
  );

  return {
    eventName,
    images: {
      Keys: keys,
      ...(carriesNew && { NewImage: newImageFor(eventName) }),
      ...(carriesOld && { OldImage: oldImageFor(eventName) }),
    },
    streamViewType: streamViewType(carriesNew, carriesOld),
  };
}

/**
 * Whether the record carries one of the images, which the test decides when it
 * mentions that image and the event name decides otherwise.
 *
 * Mentioning an image as `undefined` is how a test says a record carries none,
 * so presence of the key is what is asked here rather than presence of a value.
 */
function carriesImage(
  mentioned: boolean,
  image: unknown,
  byDefault: boolean,
): boolean {
  return mentioned ? image !== undefined : byDefault;
}

function newImageFor(eventName: string): SimLambdaDynamoDbEventImage {
  return eventName === "MODIFY" ? shippedOrder : placedOrder;
}

function oldImageFor(eventName: string): SimLambdaDynamoDbEventImage {
  return eventName === "REMOVE" ? shippedOrder : placedOrder;
}

/**
 * The view type naming the images a record carries, as real DynamoDB reports
 * the view type its stream was enabled with.
 */
function streamViewType(carriesNew: boolean, carriesOld: boolean): string {
  if (carriesNew && carriesOld) {
    return "NEW_AND_OLD_IMAGES";
  }

  if (carriesNew) {
    return "NEW_IMAGE";
  }

  return carriesOld ? "OLD_IMAGE" : "KEYS_ONLY";
}
