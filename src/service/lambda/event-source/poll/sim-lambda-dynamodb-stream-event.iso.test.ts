import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimLambdaDynamoDbStreamEventSourceArn } from "../stream/sim-lambda-dynamodb-stream-event-source-arn.js";
import { SimLambdaDynamoDbStreamEventBuilder } from "./sim-lambda-dynamodb-stream-event.js";

const eventSourceArn = SimLambdaDynamoDbStreamEventSourceArn.of(
  "arn:aws:dynamodb:eu-west-2:111111111111:table/orders/stream/2026-08-04T09:00:00.000",
);

const builder = new SimLambdaDynamoDbStreamEventBuilder(eventSourceArn);

describe("sim Lambda DynamoDB stream event builder", () => {
  it("carries only the images the stream's view type gave a record", () => {
    // Given a record from a KEYS_ONLY stream, which has neither image.
    const record = {
      eventID: "1",
      eventName: "INSERT",
      eventVersion: "1.1",
      awsRegion: "eu-west-2",
      dynamodb: {
        Keys: { orderId: { S: "order-1" } },
        SequenceNumber: "100000000000000000001",
        SizeBytes: 20,
        StreamViewType: "KEYS_ONLY",
      },
    } as const;

    // When it is built into an event.
    const [built] = builder.of([record]).Records;

    assertNonNullable(built);

    // Then the images an image-less record never had are absent rather than
    // present and empty.
    assertObjectEquals(built.dynamodb.Keys, { orderId: { S: "order-1" } });
    assertUndefined(built.dynamodb.NewImage);
    assertUndefined(built.dynamodb.OldImage);
    assertUndefined(built.dynamodb.ApproximateCreationDateTime);
  });

  it("falls back to what the mapping knows for a record that says nothing", () => {
    // Given a record with none of its parts filled in, which nothing simulated
    // DynamoDB answers with: the port is shaped as the SDK shapes it, where
    // every part of a record is optional.
    // When it is built into an event.
    const [built] = builder.of([{}]).Records;

    assertNonNullable(built);

    // Then the event still has the shape a handler reads, with the Region
    // taken from the stream the mapping polls.
    assertIdentical(built.eventID, "");
    assertIdentical(built.eventName, "");
    assertIdentical(built.eventVersion, "");
    assertIdentical(built.awsRegion, "eu-west-2");
    assertIdentical(built.dynamodb.SequenceNumber, "");
    assertIdentical(built.dynamodb.SizeBytes, 0);
    assertIdentical(built.dynamodb.StreamViewType, "");
    assertUndefined(built.userIdentity);
  });

  it("base64 encodes binary, however deeply it is nested", () => {
    // Given a record carrying bytes at the top level, in a set, and inside a
    // list and a map, as the Streams API hands them out.
    const record = {
      dynamodb: {
        NewImage: {
          thumbnail: { B: Uint8Array.from([1, 2, 3]) },
          fingerprints: { BS: [Uint8Array.from([4, 5]), Uint8Array.from([6])] },
          history: { L: [{ B: Uint8Array.from([7]) }, { N: "1" }] },
          meta: { M: { signature: { B: Uint8Array.from([8, 9]) } } },
        },
      },
    };

    // When it is built into an event.
    const [built] = builder.of([record]).Records;

    assertNonNullable(built);

    // Then every one of them is the base64 the event is written with, so a
    // handler decoding with `Buffer.from(value, "base64")` reads what it does
    // on AWS.
    const image = built.dynamodb.NewImage;

    assertNonNullable(image);

    const [nested, alongside] = image["history"]?.L ?? [];

    assertIdentical(image["thumbnail"]?.B, "AQID");
    assertArrayEquals([...(image["fingerprints"]?.BS ?? [])], ["BAU=", "Bg=="]);
    assertIdentical(nested?.B, "Bw==");
    assertIdentical(alongside?.N, "1");
    assertIdentical(image["meta"]?.M?.["signature"]?.B, "CAk=");
  });

  it("lower-cases an identity the Streams API capitalizes", () => {
    // Given a record whose identity says only who made the change.
    const record = { userIdentity: { Type: "Service" } };

    // When it is built into an event.
    const [built] = builder.of([record]).Records;

    assertNonNullable(built);

    // Then the event names the identity its own way, with nothing missing
    // left undefined inside it.
    assertObjectEquals(built.userIdentity, {
      type: "Service",
      principalId: "",
    });
  });
});
