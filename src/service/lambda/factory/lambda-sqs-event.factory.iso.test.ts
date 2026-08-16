import { createHash } from "node:crypto";

import { VariantFactory } from "@kensio/part-factory";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertStringLength,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  lambdaSqsEventFactory,
  lambdaSqsEventRecordFactory,
} from "./lambda-sqs-event.factory.js";

describe("The Lambda SQS event factories", () => {
  it("makes a record an SQS event source mapping would deliver", () => {
    // When a record is made with nothing said about the message
    const record = lambdaSqsEventRecordFactory.make();

    // Then it is a message received once from a simulated queue
    assertObjectMatches(record, {
      eventSource: "aws:sqs",
      awsRegion: "us-east-1",
      attributes: { ApproximateReceiveCount: "1" },
      messageAttributes: {},
    });
    assertStringIncludes(record.eventSourceARN, ":sqs:us-east-1:");
    expect(record.receiptHandle.length).toBeGreaterThan(0);
  });

  it("digests the body the message was sent with", () => {
    // When a record is made for a particular message body
    const record = lambdaSqsEventRecordFactory.make({ body: "hello" });

    // Then the digest is of that body, which is what a handler checking it
    // compares against
    assertIdentical(
      record.md5OfBody,
      createHash("md5").update("hello", "utf8").digest("hex"),
    );
  });

  it("reports the Region of the queue the record came from", () => {
    // When a record is made for a queue in another Region
    const record = lambdaSqsEventRecordFactory.make({
      eventSourceARN: "arn:aws:sqs:eu-west-2:888888888888:orders",
    });

    // Then the record's Region is that queue's rather than the default
    assertIdentical(record.awsRegion, "eu-west-2");
  });

  it("makes the single-message batch a quiet queue delivers", () => {
    // When an event is made with nothing said about the batch
    const event = lambdaSqsEventFactory.make();

    // Then it holds one complete record
    assertArrayLength(event.Records, 1);
    assertIdentical(event.Records[0].eventSource, "aws:sqs");
  });

  it("completes every record of a batch a test asks for", () => {
    // When an event is made saying only what each message carries
    const event = lambdaSqsEventFactory.make({
      Records: [{ body: "first" }, { body: "second" }],
    });

    // Then both records are whole, with their own message ids and digests
    assertArrayLength(event.Records, 2);
    expect(event.Records.map((record) => record.body)).toStrictEqual([
      "first",
      "second",
    ]);
    expect(event.Records[0].messageId).not.toBe(event.Records[1].messageId);
    for (const record of event.Records) {
      assertIdentical(record.eventSource, "aws:sqs");
      assertStringLength(record.md5OfBody, 32);
    }
  });

  it("makes the empty batch no real queue delivers when asked to", () => {
    // When an event is made for no messages at all
    const event = lambdaSqsEventFactory.make({ Records: [] });

    // Then it has none, rather than the default one
    expect(event.Records).toStrictEqual([]);
  });

  it("composes into a named variation of a queue's messages", () => {
    // Given a variant factory for the orders queue of one Region
    const ordersEventFactory = new VariantFactory(lambdaSqsEventFactory, {
      Records: [
        { eventSourceARN: "arn:aws:sqs:eu-west-2:888888888888:orders" },
      ],
    });

    // When an event is made from it
    const event = ordersEventFactory.make();

    // Then the record is that queue's, and still complete
    assertObjectMatches(event.Records[0] ?? {}, {
      eventSource: "aws:sqs",
      eventSourceARN: "arn:aws:sqs:eu-west-2:888888888888:orders",
      awsRegion: "eu-west-2",
    });
  });
});
