import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  lambdaDynamoDbStreamEventFactory,
  lambdaDynamoDbStreamEventRecordFactory,
} from "./lambda-dynamodb-stream-event.factory.js";

describe("The Lambda DynamoDB stream event factories", () => {
  it("makes the record an inserted item produces", () => {
    // When a record is made with nothing said about the change
    const record = lambdaDynamoDbStreamEventRecordFactory.make();

    // Then it is an insert, carrying the keys and the new image and saying so
    assertObjectMatches(record, {
      eventName: "INSERT",
      eventSource: "aws:dynamodb",
      awsRegion: "us-east-1",
      dynamodb: { StreamViewType: "NEW_IMAGE" },
    });
    expect(record.dynamodb.Keys).toBeDefined();
    expect(record.dynamodb.NewImage).toBeDefined();
    assertUndefined(record.dynamodb.OldImage);
  });

  it("carries the images the change it reports would have", () => {
    // When records are made for each of the three changes a stream reports
    const modified = lambdaDynamoDbStreamEventRecordFactory.make({
      eventName: "MODIFY",
    });
    const removed = lambdaDynamoDbStreamEventRecordFactory.make({
      eventName: "REMOVE",
    });

    // Then a modification carries both images and a removal only the old one,
    // with the view type naming what is there
    assertIdentical(modified.dynamodb.StreamViewType, "NEW_AND_OLD_IMAGES");
    expect(modified.dynamodb.NewImage).toBeDefined();
    expect(modified.dynamodb.OldImage).toBeDefined();

    assertIdentical(removed.dynamodb.StreamViewType, "OLD_IMAGE");
    assertUndefined(removed.dynamodb.NewImage);
    expect(removed.dynamodb.OldImage).toBeDefined();
  });

  it("names the view type of an image the test added itself", () => {
    // When an insert record is made carrying an old image as well
    const record = lambdaDynamoDbStreamEventRecordFactory.make({
      dynamodb: { OldImage: { status: { S: "pending" } } },
    });

    // Then the view type names both images rather than the one the event name
    // would have carried
    assertIdentical(record.dynamodb.StreamViewType, "NEW_AND_OLD_IMAGES");
  });

  it("makes a keys-only record when the test takes the images away", () => {
    // When a record is made with both images explicitly absent, as a
    // KEYS_ONLY stream delivers
    const record = lambdaDynamoDbStreamEventRecordFactory.make({
      dynamodb: { NewImage: undefined, OldImage: undefined },
    });

    // Then it says it carries only the keys
    assertIdentical(record.dynamodb.StreamViewType, "KEYS_ONLY");
    assertUndefined(record.dynamodb.NewImage);
    expect(record.dynamodb.Keys).toBeDefined();
  });

  it("takes the item's own keys and image from the test", () => {
    // When a record is made for a particular item
    const record = lambdaDynamoDbStreamEventRecordFactory.make({
      dynamodb: {
        Keys: { orderId: { S: "YL-9" } },
        NewImage: { orderId: { S: "YL-9" }, status: { S: "shipped" } },
      },
    });

    // Then that is the item the record reports
    expect(record.dynamodb.Keys).toStrictEqual({ orderId: { S: "YL-9" } });
    expect(record.dynamodb.NewImage).toStrictEqual({
      orderId: { S: "YL-9" },
      status: { S: "shipped" },
    });
  });

  it("reports the Region of the stream the record came from", () => {
    // When a record is made for a stream in another Region
    const record = lambdaDynamoDbStreamEventRecordFactory.make({
      eventSourceARN:
        "arn:aws:dynamodb:eu-west-2:888888888888:table/orders/stream/2026-01-01T00:00:00.000",
    });

    // Then the record's Region is that stream's rather than the default
    assertIdentical(record.awsRegion, "eu-west-2");
  });

  it("completes every record of a batch a test asks for", () => {
    // When an event is made saying only what each record reports
    const event = lambdaDynamoDbStreamEventFactory.make({
      Records: [{ eventName: "INSERT" }, { eventName: "REMOVE" }],
    });

    // Then both records are whole, each with the images its change has
    assertArrayLength(event.Records, 2);
    assertIdentical(event.Records[0].dynamodb.StreamViewType, "NEW_IMAGE");
    assertIdentical(event.Records[1].dynamodb.StreamViewType, "OLD_IMAGE");
    for (const record of event.Records) {
      assertIdentical(record.eventSource, "aws:dynamodb");
      assertIdentical(record.eventVersion, "1.1");
    }
  });

  it("makes the single-record batch one changed item produces", () => {
    // When an event is made with nothing said about the batch
    const event = lambdaDynamoDbStreamEventFactory.make();

    // Then it holds one complete record
    assertArrayLength(event.Records, 1);
    assertIdentical(event.Records[0].eventName, "INSERT");
  });
});
