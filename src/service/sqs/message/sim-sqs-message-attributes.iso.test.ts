import { ReceiveMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../error/sim-sqs.error.js";
import { simAwsWithQueue } from "../../../../test/sqs/queue-fixture.js";

describe("SQS message attributes", () => {
  it("round-trips string, number and binary attributes with their digest", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message carrying one attribute of each kind is sent and received.
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
          attempt: { DataType: "Number", StringValue: "2" },
          payload: {
            DataType: "Binary",
            BinaryValue: new Uint8Array([1, 2, 3]),
          },
        },
      }),
    );
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["All"],
      }),
    );

    // Then every attribute comes back as it was sent, under the same digest.
    const message = received.Messages?.[0];

    assertNonNullable(message?.MessageAttributes);
    assertIdentical(message.MessageAttributes["tenant"]?.StringValue, "acme");
    assertIdentical(message.MessageAttributes["attempt"]?.DataType, "Number");
    assertArrayEquals(
      [...(message.MessageAttributes["payload"]?.BinaryValue ?? [])],
      [1, 2, 3],
    );
    assertIdentical(
      message.MD5OfMessageAttributes,
      sent.MD5OfMessageAttributes,
    );
  });

  it("selects the attributes a receive request asks for by prefix", async () => {
    // Given a queue holding a message with two prefixed attributes and one other.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          "app.tenant": { DataType: "String", StringValue: "acme" },
          "app.attempt": { DataType: "Number", StringValue: "2" },
          other: { DataType: "String", StringValue: "no" },
        },
      }),
    );

    // When the prefix is asked for.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["app.*"],
      }),
    );

    // Then only the matching attributes come back.
    const attributes = received.Messages?.[0]?.MessageAttributes;

    assertNonNullable(attributes);
    assertArrayEquals(
      Object.keys(attributes).toSorted((one, other) =>
        one.localeCompare(other),
      ),
      ["app.attempt", "app.tenant"],
    );
  });

  it("selects one attribute by name", async () => {
    // Given a queue holding a message with two attributes.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
          attempt: { DataType: "Number", StringValue: "2" },
        },
      }),
    );

    // When one of them is asked for by name.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["tenant"],
      }),
    );

    // Then that is the only one that comes back.
    const attributes = received.Messages?.[0]?.MessageAttributes;

    assertNonNullable(attributes);
    assertArrayEquals(Object.keys(attributes), ["tenant"]);
  });

  it("returns none when a receive request asks for none", async () => {
    // Given a queue holding a message with an attribute.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String", StringValue: "acme" },
        },
      }),
    );

    // When it is received without naming any attribute.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // Then none come back, as real SQS returns none.
    assertUndefined(received.Messages?.[0]?.MessageAttributes);
    assertUndefined(received.Messages?.[0]?.MD5OfMessageAttributes);
  });

  it("keeps a binary attribute clear of the arrays either side of it", async () => {
    // Given a queue and a binary attribute value the sender still holds.
    const { simAws, queueUrl } = await simAwsWithQueue();
    const payload = new Uint8Array([1, 2, 3]);

    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          payload: { DataType: "Binary", BinaryValue: payload },
        },
      }),
    );

    // When the sender mutates its own array afterwards, and a consumer mutates
    // the one it is given.
    payload[0] = 9;

    const first = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["All"],
        VisibilityTimeout: 0,
      }),
    );
    const received = first.Messages?.[0]?.MessageAttributes?.["payload"];

    assertNonNullable(received?.BinaryValue);
    received.BinaryValue[1] = 9;

    // Then the message still carries the bytes it was sent with.
    const again = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MessageAttributeNames: ["All"],
      }),
    );

    assertArrayEquals(
      [
        ...(again.Messages?.[0]?.MessageAttributes?.["payload"]?.BinaryValue ??
          []),
      ],
      [1, 2, 3],
    );
  });

  it("refuses an attribute name real SQS would refuse", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute name uses a reserved prefix.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            "AWS.tenant": { DataType: "String", StringValue: "acme" },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses an attribute name with a disallowed character", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute name has a space in it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            "tenant name": { DataType: "String", StringValue: "acme" },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses an attribute name with two periods in succession", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute name has a double period in it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            "app..tenant": { DataType: "String", StringValue: "acme" },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a data type that is not one of the three SQS has", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute declares its own data type.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            tenant: { DataType: "Text", StringValue: "acme" },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses an attribute with no data type at all", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute declares no data type.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage({
        input: {
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: { tenant: { StringValue: "acme" } },
        },
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("accepts a custom label on one of the three data types", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute labels its string type.
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "order-1",
        MessageAttributes: {
          tenant: { DataType: "String.tenantId", StringValue: "acme" },
        },
      }),
    );

    // Then it is accepted, as real SQS accepts it.
    assertNonNullable(sent.MD5OfMessageAttributes);
  });

  it("refuses a value that does not match its data type", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a binary attribute carries a string value.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            payload: { DataType: "Binary", StringValue: "acme" },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a string attribute with no value", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a string attribute carries nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: { tenant: { DataType: "String" } },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses list values, which real SQS refuses too", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an attribute carries a list of values.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageAttributes: {
            tenants: { DataType: "String", StringListValues: ["acme"] },
          },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });
});
