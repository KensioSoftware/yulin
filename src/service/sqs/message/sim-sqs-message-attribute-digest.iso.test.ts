import { createHash } from "node:crypto";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithQueue } from "../../../../test/sqs/queue-fixture.js";

describe("SQS message attribute digests", () => {
  it("digests attributes the way real SQS digests them", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message with one string attribute is sent.
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
        },
      }),
    );

    // Then the digest is the documented length-prefixed encoding: the name, the
    // data type, the transport type byte, then the value.
    const encoded = Buffer.concat([
      lengthPrefixed("tenant"),
      lengthPrefixed("String"),
      Buffer.of(1),
      lengthPrefixed("acme"),
    ]);

    assertIdentical(
      sent.MD5OfMessageAttributes,
      createHash("md5").update(encoded).digest("hex"),
    );
  });

  it("digests a binary attribute under its own transport type", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message with one binary attribute is sent.
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          payload: { DataType: "Binary", BinaryValue: new Uint8Array([7, 8]) },
        },
      }),
    );

    // Then the value's bytes are digested behind a transport type of two.
    const encoded = Buffer.concat([
      lengthPrefixed("payload"),
      lengthPrefixed("Binary"),
      Buffer.of(2),
      lengthPrefixed(Buffer.from([7, 8])),
    ]);

    assertIdentical(
      sent.MD5OfMessageAttributes,
      createHash("md5").update(encoded).digest("hex"),
    );
  });
});

/**
 * One digest field, as SQS encodes message attributes.
 */
function lengthPrefixed(value: string | Buffer): Buffer {
  const bytes = Buffer.from(value);
  const length = Buffer.alloc(4);

  length.writeUInt32BE(bytes.length);

  return Buffer.concat([length, bytes]);
}
