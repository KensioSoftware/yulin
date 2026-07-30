import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSqsInvalidAttributeName,
  SimSqsInvalidAttributeValue,
  SimSqsUnsupportedOperation,
  SimSqsValidationException,
} from "../../error/sim-sqs.error.js";

/**
 * A simulated AWS with one queue, and that queue's URL.
 */
async function simAwsWithQueue(
  attributes?: Record<string, string>,
): Promise<{ simAws: SimAws; queueUrl: string }> {
  const simAws = new SimAws();
  const created = await simAws.sqs().createQueue(
    new CreateQueueCommand({
      QueueName: "orders",
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );

  return { simAws, queueUrl: created.QueueUrl ?? "" };
}

describe("SQS queue attribute commands", () => {
  it("gives a new queue the attribute defaults real SQS gives it", async () => {
    // Given a queue created with no attributes.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When every attribute is asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    // Then the defaults are the ones AWS documents.
    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["VisibilityTimeout"], "30");
    assertIdentical(read.Attributes["DelaySeconds"], "0");
    assertIdentical(read.Attributes["MessageRetentionPeriod"], "345600");
    assertIdentical(read.Attributes["MaximumMessageSize"], "262144");
    assertIdentical(read.Attributes["ReceiveMessageWaitTimeSeconds"], "0");
  });

  it("reports the queue ARN and its timestamps", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When the read-only attributes are asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["QueueArn", "CreatedTimestamp"],
      }),
    );

    // Then the ARN names the queue, and the timestamp is in whole seconds.
    const createdSeconds = Math.floor(simAws.now().getTime() / 1000);

    assertNonNullable(read.Attributes);
    assertIdentical(
      read.Attributes["QueueArn"],
      `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`,
    );
    assertIdentical(
      read.Attributes["CreatedTimestamp"],
      String(createdSeconds),
    );
  });

  it("returns only the attributes a request names", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When one attribute is asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["VisibilityTimeout"],
      }),
    );

    // Then that is all that comes back.
    assertNonNullable(read.Attributes);
    assertArrayLength(Object.keys(read.Attributes), 1);
    assertIdentical(read.Attributes["VisibilityTimeout"], "30");
  });

  it("returns no attributes when a request names none", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When the attributes are asked for without naming any.
    const read = await simAws
      .sqs()
      .getQueueAttributes(
        new GetQueueAttributesCommand({ QueueUrl: queueUrl }),
      );

    // Then none come back, as real SQS returns none.
    assertUndefined(read.Attributes);
  });

  it("leaves out an attribute real SQS has and this simulation does not", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a redrive policy is asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["RedrivePolicy"],
      }),
    );

    // Then it is left out rather than refused, as real SQS leaves out an
    // attribute the queue has no value for.
    assertUndefined(read.Attributes);
  });

  it("refuses an attribute name that is not an SQS attribute", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an invented attribute is asked for.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().getQueueAttributes({
        input: {
          QueueUrl: queueUrl,
          AttributeNames: ["VisibilityTimeoutSeconds"],
        },
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("counts visible, hidden and delayed messages separately", async () => {
    // Given a queue holding a visible message, a received one and a delayed one.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "a" }),
      );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "b" }),
      );
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: "c",
        DelaySeconds: 60,
      }),
    );
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // When the counts are asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    // Then each message is counted in the state it is in.
    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["ApproximateNumberOfMessages"], "1");
    assertIdentical(
      read.Attributes["ApproximateNumberOfMessagesNotVisible"],
      "1",
    );
    assertIdentical(read.Attributes["ApproximateNumberOfMessagesDelayed"], "1");
  });

  it("changes an attribute of an existing queue", async () => {
    // Given a queue with the default visibility timeout.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When the timeout is changed.
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: { VisibilityTimeout: "120" },
      }),
    );

    // Then the new value is what the queue reports.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["VisibilityTimeout"],
      }),
    );

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["VisibilityTimeout"], "120");
  });

  it("refuses an attribute value outside the range real SQS accepts", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a visibility timeout beyond twelve hours is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { VisibilityTimeout: "43201" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
  });

  it("refuses an attribute value that is not a whole number", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a queue is created with a fractional delay.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: { DelaySeconds: "1.5" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
  });

  it("refuses to set an attribute SQS reports rather than accepts", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a read-only attribute is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { QueueArn: "arn:aws:sqs:us-east-1:111111111111:other" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("refuses to set a real SQS attribute this simulation does not model", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a redrive policy is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { RedrivePolicy: "{}" },
        }),
      );
    });

    // Then it is refused rather than ignored.
    assertInstanceOf(error, SimSqsUnsupportedOperation);
  });

  it("refuses to set an attribute that is not an SQS attribute", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When an invented attribute is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes({
        input: { QueueUrl: queueUrl, Attributes: { Timeout: "10" } },
      });
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("refuses a set with no attributes", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When attributes are set without any being given.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes({ input: { QueueUrl: queueUrl } });
    });

    // Then the missing input is reported.
    assertInstanceOf(error, SimSqsValidationException);
  });

  it("purges every message on a queue", async () => {
    // Given a queue holding two messages, one of them in flight.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "a" }),
      );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "b" }),
      );
    await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    // When the queue is purged.
    await simAws
      .sqs()
      .purgeQueue(new PurgeQueueCommand({ QueueUrl: queueUrl }));

    // Then nothing is left on it, hidden or otherwise.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["ApproximateNumberOfMessages"], "0");
    assertIdentical(
      read.Attributes["ApproximateNumberOfMessagesNotVisible"],
      "0",
    );
  });
});
