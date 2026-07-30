import { createHash } from "node:crypto";
import { CreateQueueCommand, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import {
  SimSqsInvalidMessageContents,
  SimSqsInvalidParameterValue,
  SimSqsUnsupportedOperation,
} from "../../error/sim-sqs.error.js";
import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";

describe("SQS SendMessage", () => {
  it("reports a message id and a real MD5 of the body", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message is sent.
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // Then the digest is one the sender can check its own body against.
    assertNonNullable(sent.MessageId);
    assertUuidV4(sent.MessageId);
    assertIdentical(
      sent.MD5OfMessageBody,
      createHash("md5").update("order-1", "utf8").digest("hex"),
    );
    assertUndefined(sent.MD5OfMessageAttributes);
  });

  it("refuses a body larger than the queue accepts", async () => {
    // Given a queue with a small maximum message size.
    const { simAws, queueUrl } = await simAwsWithQueue({
      MaximumMessageSize: "1024",
    });

    // When a larger body is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "x".repeat(1025),
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses an empty body", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message with no body is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage({ input: { QueueUrl: queueUrl } });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a body carrying characters SQS does not allow", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a body with a control character is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: `order${String.fromCodePoint(0)}one`,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidMessageContents);
  });

  it("accepts a body of emoji and other supplementary characters", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a body outside the basic multilingual plane is sent.
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order 🧾" }),
      );

    // Then it is accepted, as real SQS accepts it.
    assertNonNullable(sent.MessageId);
  });

  it("accepts a body with newlines and other allowed characters", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a body with a newline, a tab and a replacement character is sent.
    const sent = await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: `line one\n\tline two ${String.fromCodePoint(0xff_fd)}`,
      }),
    );

    // Then it is accepted, as real SQS accepts all of them.
    assertNonNullable(sent.MessageId);
  });

  it("refuses a per-message delay outside the range real SQS accepts", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a delay beyond fifteen minutes is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          DelaySeconds: 901,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses the FIFO fields, since there are no FIFO queues here", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a message group is named.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageGroupId: "tenant-acme",
        }),
      );
    });

    // Then it is refused rather than accepted as an ordering that is not there.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("refuses message system attributes", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an X-Ray trace header is sent with the message.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
          MessageSystemAttributes: {
            AWSTraceHeader: { DataType: "String", StringValue: "Root=1-2-3" },
          },
        }),
      );
    });

    // Then it is refused, since they are not modelled.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("refuses a send with no queue URL", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a message is sent with no queue named.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage({ input: { MessageBody: "order-1" } });
    });

    // Then the missing input is reported.
    assertIdentical(error.name, "ValidationException");
  });

  it("refuses a queue URL that is not a queue URL", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a message is sent to something that is not a queue URL.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: "https://example.com/orders",
          MessageBody: "order-1",
        }),
      );
    });

    // Then it is refused as an invalid address.
    assertIdentical(error.name, "InvalidAddress");
  });

  it("reaches no queue through a URL naming another Region", async () => {
    // Given a queue in one Region.
    const simAws = new SimAws({
      defaultAccountId: "111111111111" as SimAwsAccountId,
      defaultRegionName: "eu-west-2",
    });
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders" }));

    // When a message is sent to a same-named queue in another Region.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: "https://sqs.us-east-1.amazonaws.com/111111111111/orders",
          MessageBody: "order-1",
        }),
      );
    });

    // Then the queue does not exist as far as this scope is concerned.
    assertIdentical(error.name, "QueueDoesNotExist");
  });
});
