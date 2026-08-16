import type { DeepPartialObject } from "@kensio/part-factory";

import type {
  SimLambdaDynamoDbEventImage,
  SimLambdaDynamoDbStreamEventRecord,
} from "../event-source/poll/sim-lambda-dynamodb-stream-event.types.js";

type StreamRecordOverrides =
  DeepPartialObject<SimLambdaDynamoDbStreamEventRecord>;

/**
 * The images one record carries by default, which is what the change is.
 *
 * All three are optional because an image the test described itself is left
 * out of the defaults entirely. Overrides are merged onto defaults key by key,
 * so a default image left in would reach the record as the test's item merged
 * with this one, carrying attributes and even keys the test never mentioned.
 */
interface StreamRecordImages {
  readonly Keys?: SimLambdaDynamoDbEventImage;
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

  // Mentioning an image as `undefined` is how a test says a record carries
  // none, so what is asked here is whether the test named the image at all
  // rather than whether it gave a value for it.
  const namedKeys = Object.hasOwn(body, "Keys");
  const namedNew = Object.hasOwn(body, "NewImage");
  const namedOld = Object.hasOwn(body, "OldImage");

  const carriesNew = namedNew
    ? body.NewImage !== undefined
    : eventName !== "REMOVE";
  const carriesOld = namedOld
    ? body.OldImage !== undefined
    : eventName !== "INSERT";

  return {
    eventName,
    // An image the test described is left out here and comes from the
    // overrides whole, rather than being merged onto one of these.
    images: {
      ...(!namedKeys && { Keys: keys }),
      ...(carriesNew && !namedNew && { NewImage: newImageFor(eventName) }),
      ...(carriesOld && !namedOld && { OldImage: oldImageFor(eventName) }),
    },
    streamViewType: streamViewType(carriesNew, carriesOld),
  };
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
