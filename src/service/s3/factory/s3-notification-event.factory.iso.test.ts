import { VariantFactory } from "@kensio/part-factory";
import {
  assertArrayLength,
  assertIdentical,
  assertObjectMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  s3NotificationEventFactory,
  s3NotificationEventRecordFactory,
} from "./s3-notification-event.factory.js";

describe("The S3 event notification factories", () => {
  it("makes the record an uploaded Object produces", () => {
    // When a record is made with nothing said about the Object event
    const record = s3NotificationEventRecordFactory.make();

    // Then it is a creation of an Object that exists to be read
    assertObjectMatches(record, {
      eventSource: "aws:s3",
      eventName: "ObjectCreated:Put",
      awsRegion: "us-east-1",
      s3: {
        s3SchemaVersion: "1.0",
        bucket: { name: "uploads", arn: "arn:aws:s3:::uploads" },
      },
    });
    expect(record.s3.object.size).toBeDefined();
    expect(record.s3.object.eTag).toBeDefined();
  });

  it("names the ARN of the Bucket the event was about", () => {
    // When a record is made for another Bucket
    const record = s3NotificationEventRecordFactory.make({
      s3: { bucket: { name: "reports" } },
    });

    // Then the ARN is that Bucket's rather than the default one's
    assertIdentical(record.s3.bucket.arn, "arn:aws:s3:::reports");
  });

  it("reports no Object detail for a removal", () => {
    // When a record is made for a deleted Object
    const record = s3NotificationEventRecordFactory.make({
      eventName: "ObjectRemoved:Delete",
    });

    // Then it carries neither size nor eTag, as a real removal record does not
    assertUndefined(record.s3.object.size);
    assertUndefined(record.s3.object.eTag);
    expect(record.s3.object.sequencer).toHaveLength(16);
  });

  it("makes the single-record event a Bucket delivers", () => {
    // When an event is made with nothing said about it
    const event = s3NotificationEventFactory.make();

    // Then it holds the one record real S3 delivers per event
    assertArrayLength(event.Records, 1);
    assertIdentical(event.Records[0].eventSource, "aws:s3");
  });

  it("completes every record a test asks for", () => {
    // When an event is made saying only what each record is about
    const event = s3NotificationEventFactory.make({
      Records: [
        { s3: { object: { key: "orders/YL-9.json" } } },
        { eventName: "ObjectRemoved:Delete" },
      ],
    });

    // Then both records are whole, each describing its own Object event
    assertArrayLength(event.Records, 2);
    assertIdentical(event.Records[0].s3.object.key, "orders/YL-9.json");
    assertIdentical(event.Records[0].eventName, "ObjectCreated:Put");
    assertUndefined(event.Records[1].s3.object.size);
  });

  it("composes into a named variation of a Bucket's events", () => {
    // Given a variant factory for the reports Bucket's uploads
    const reportUploadedFactory = new VariantFactory(
      s3NotificationEventFactory,
      { Records: [{ s3: { bucket: { name: "reports" } } }] },
    );

    // When an event is made from it for a particular key
    const event = reportUploadedFactory.make({
      Records: [
        { s3: { bucket: { name: "reports" }, object: { key: "q4.csv" } } },
      ],
    });

    // Then the record is that Bucket's, and still complete
    assertObjectMatches(event.Records[0] ?? {}, {
      eventSource: "aws:s3",
      s3: {
        bucket: { name: "reports", arn: "arn:aws:s3:::reports" },
        object: { key: "q4.csv" },
      },
    });
  });
});
