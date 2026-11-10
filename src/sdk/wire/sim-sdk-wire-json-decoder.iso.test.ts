import { faker } from "@faker-js/faker";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertObjectEquals,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { readSimSdkWireInput } from "./sim-sdk-wire-json.js";

describe("reading an AWS JSON protocol body", () => {
  const body = (value: unknown): Uint8Array =>
    Buffer.from(JSON.stringify(value));

  it("decodes blobs nested in recursive shapes", () => {
    // Given a DynamoDB item holding binary values inside a map and a list.
    const bytes = Uint8Array.from(Buffer.from(faker.string.alphanumeric(24)));
    const base64 = Buffer.from(bytes).toString("base64");

    // When the PutItem body is read.
    const input = readSimSdkWireInput(
      body({
        TableName: "orders",
        Item: {
          receipt: { M: { scan: { B: base64 } } },
          pages: { L: [{ BS: [base64] }] },
          note: { S: base64 },
        },
      }),
      "DynamoDB",
      "PutItem",
    ) as {
      Item: {
        receipt: { M: { scan: { B: unknown } } };
        pages: { L: [{ BS: [unknown] }] };
        note: { S: unknown };
      };
    };

    // Then the binary values are bytes again, and the string is left alone.
    const scan = input.Item.receipt.M.scan.B;
    assertInstanceOf(scan, Uint8Array);
    assertArrayEquals([...scan], [...bytes]);
    const page = input.Item.pages.L[0].BS[0];
    assertInstanceOf(page, Uint8Array);
    assertArrayEquals([...page], [...bytes]);
    assertIdentical(input.Item.note.S, base64);
  });

  it("decodes epoch seconds and date strings as timestamps", () => {
    // Given a point in time with a fraction of a second.
    const pointInTime = faker.date.recent();

    // When it arrives as epoch seconds, and as a date string.
    const fromSeconds = readSimSdkWireInput(
      body({
        StreamName: "s",
        ShardId: "x",
        Timestamp: pointInTime.getTime() / 1000,
      }),
      "Kinesis",
      "GetShardIterator",
    ) as { Timestamp: unknown };
    const fromString = readSimSdkWireInput(
      body({
        StreamName: "s",
        ShardId: "x",
        Timestamp: pointInTime.toISOString(),
      }),
      "Kinesis",
      "GetShardIterator",
    ) as { Timestamp: unknown };

    // Then both read as that point in time.
    assertInstanceOf(fromSeconds.Timestamp, Date);
    assertIdentical(fromSeconds.Timestamp.getTime(), pointInTime.getTime());
    assertInstanceOf(fromString.Timestamp, Date);
    assertIdentical(fromString.Timestamp.getTime(), pointInTime.getTime());
  });

  it("keeps the millisecond a fraction of a second names", () => {
    // Given epoch seconds whose fraction has no exact binary form: 1.009
    // multiplies out to 1008.999 milliseconds.
    // When the timestamp is read.
    const input = readSimSdkWireInput(
      body({ StreamName: "s", ShardId: "x", Timestamp: 1.009 }),
      "Kinesis",
      "GetShardIterator",
    ) as { Timestamp: unknown };

    // Then it is the 1009th millisecond, not the one before it.
    assertInstanceOf(input.Timestamp, Date);
    assertIdentical(input.Timestamp.getTime(), 1009);
  });

  it("passes on values that do not have the wire form their member calls for", () => {
    // Given a body no SDK would send, with each member in the wrong form.
    const malformed = {
      TableName: "orders",
      Item: {
        scan: { B: 42 },
        pages: { L: "pages" },
        tags: { M: ["tag"] },
        note: "note",
      },
      Expected: "expected",
    };

    // When it is read.
    const input = readSimSdkWireInput(body(malformed), "DynamoDB", "PutItem");

    // Then it reaches the operation as it was sent, for the operation to
    // refuse.
    assertObjectEquals(input, malformed);
  });

  it("leaves a timestamp member that is neither a number nor a string", () => {
    // Given a timestamp member sent as an object.
    const malformed = { StreamName: "s", ShardId: "x", Timestamp: { at: 1 } };

    // When it is read.
    const input = readSimSdkWireInput(
      body(malformed),
      "Kinesis",
      "GetShardIterator",
    );

    // Then it is passed on unchanged.
    assertObjectEquals(input, malformed);
  });

  it("reads an operation with no blobs or timestamps as it was parsed", () => {
    // Given a body for an operation whose input has neither.
    const sent = { QueueUrl: faker.internet.url(), MaxNumberOfMessages: 3 };

    // When it is read, for a known and for an unknown service.
    const known = readSimSdkWireInput(body(sent), "SQS", "ReceiveMessage");
    const unknown = readSimSdkWireInput(
      body(sent),
      "Nothing",
      "ReceiveMessage",
    );

    // Then both are the parsed body.
    assertObjectEquals(known, sent);
    assertObjectEquals(unknown, sent);
  });

  it("reads an empty body as an empty input", () => {
    // Given an operation sent with no input.
    // When its empty body is read.
    const input = readSimSdkWireInput(new Uint8Array(), "KMS", "Sign");

    // Then the input is empty.
    assertObjectEquals(input, {});
  });
});
