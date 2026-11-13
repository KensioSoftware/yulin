import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  type QueueAttributeName,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSqsInvalidAttributeName,
  SimSqsInvalidAttributeValue,
  SimSqsInvalidParameterValue,
} from "../../error/sim-sqs.error.js";
import {
  simAwsWithFifoQueue,
  simAwsWithQueue,
} from "../../../../../test/sqs/queue-fixture.js";

describe("SQS FIFO queues", () => {
  const fifoAttributeNames: QueueAttributeName[] = [
    "FifoQueue",
    "ContentBasedDeduplication",
    "DeduplicationScope",
    "FifoThroughputLimit",
  ];

  it("reports the FIFO attributes with their defaults", async () => {
    // Given a FIFO queue created with nothing but FifoQueue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When its FIFO attributes are read.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: fifoAttributeNames,
      }),
    );

    // Then they carry the defaults real SQS gives a new FIFO queue.
    assertObjectEquals(read.Attributes, {
      FifoQueue: "true",
      ContentBasedDeduplication: "false",
      DeduplicationScope: "queue",
      FifoThroughputLimit: "perQueue",
    });
  });

  it("reports none of the FIFO attributes for a standard queue", async () => {
    // Given a standard queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When its FIFO attributes are asked for.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: fifoAttributeNames,
      }),
    );

    // Then there are none to report.
    assertUndefined(read.Attributes);
  });

  it("sets the high throughput attributes together", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When it is switched to high throughput.
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: {
          DeduplicationScope: "messageGroup",
          FifoThroughputLimit: "perMessageGroupId",
          ContentBasedDeduplication: "true",
        },
      }),
    );

    // Then the queue holds all three.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    const attributes = read.Attributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["DeduplicationScope"], "messageGroup");
    assertIdentical(attributes["FifoThroughputLimit"], "perMessageGroupId");
    assertIdentical(attributes["ContentBasedDeduplication"], "true");
  });

  it("refuses a per group throughput limit with queue deduplication", async () => {
    // Given a FIFO queue deduplicating across the whole queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When the throughput limit alone is set per message group.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { FifoThroughputLimit: "perMessageGroupId" },
        }),
      );
    });

    // Then it is refused, as real SQS refuses it.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
    assertStringIncludes(error.message, "DeduplicationScope");
  });

  it("refuses a FIFO attribute value SQS does not take", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When content-based deduplication is set to something but a boolean.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { ContentBasedDeduplication: "yes" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
  });

  it("refuses to change FifoQueue after the queue exists", async () => {
    // Given a FIFO queue.
    const { simAws, queueUrl } = await simAwsWithFifoQueue();

    // When FifoQueue is set on it again.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { FifoQueue: "true" },
        }),
      );
    });

    // Then it is refused, since a queue's type is fixed when it is created.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("refuses a FIFO attribute on a standard queue", async () => {
    // Given a standard queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When content-based deduplication is turned on for it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { ContentBasedDeduplication: "true" },
        }),
      );
    });

    // Then it is refused as an attribute the queue does not have.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("refuses FifoQueue false, which real SQS does not take", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a standard queue is asked for with FifoQueue set to false.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: { FifoQueue: "false" },
        }),
      );
    });

    // Then it is refused, since a standard queue leaves the attribute out.
    assertInstanceOf(error, SimSqsInvalidAttributeName);
  });

  it("refuses a FifoQueue value that is not a boolean", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When FifoQueue is set to something else.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders.fifo",
          Attributes: { FifoQueue: "yes" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
  });

  it("refuses a FIFO queue whose name does not end .fifo", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a FIFO queue is asked for under a standard queue's name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: { FifoQueue: "true" },
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertStringIncludes(error.message, ".fifo");
  });

  it("answers a repeated create with the existing FIFO queue", async () => {
    // Given a FIFO queue with content-based deduplication.
    const { simAws, queueUrl } = await simAwsWithFifoQueue({
      ContentBasedDeduplication: "true",
    });

    // When the same queue is asked for again.
    const again = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders.fifo",
        Attributes: { FifoQueue: "true", ContentBasedDeduplication: "true" },
      }),
    );

    // Then the existing queue is answered with.
    assertIdentical(again.QueueUrl, queueUrl);
  });

  it("refuses a standard dead-letter queue for a FIFO queue", async () => {
    // Given a standard queue.
    const { simAws } = await simAwsWithQueue();
    const standardArn = simAws.sqs().findQueue("orders")?.arn.value;

    // When a FIFO queue is created redriving to it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAwsWithFifoQueue(
        {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: standardArn,
            maxReceiveCount: 3,
          }),
        },
        simAws,
      );
    });

    // Then it is refused, since the two queues have to be of one type.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertStringIncludes(error.message, "must also be a FIFO queue");
  });
});
