import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimSqsInvalidParameterValue,
  SimSqsQueueNameExists,
} from "../error/sim-sqs.error.js";
import {
  simAwsWithDeadLetterQueue,
  simAwsWithQueue,
} from "../../../../test/sqs/queue-fixture.js";

/**
 * Set a redrive policy on a queue, which is what a test asserting the policy is
 * refused is actually doing.
 */
async function setRedrivePolicy(
  simAws: SimAws,
  queueUrl: string,
  policy: string,
): Promise<void> {
  await simAws.sqs().setQueueAttributes(
    new SetQueueAttributesCommand({
      QueueUrl: queueUrl,
      Attributes: { RedrivePolicy: policy },
    }),
  );
}

describe("SQS redrive policy", () => {
  it("reports back the redrive policy that was set", async () => {
    // Given a queue and a dead-letter queue to point it at.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);
    const policy = JSON.stringify({
      deadLetterTargetArn: deadLetterQueueArn,
      maxReceiveCount: 3,
    });

    // When the redrive policy is read back.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["RedrivePolicy"],
      }),
    );

    // Then it is the string the queue was created with.
    assertIdentical(read.Attributes?.["RedrivePolicy"], policy);
  });

  it("accepts a maxReceiveCount carried as a string, as AWS documents it", async () => {
    // Given a queue and a dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When a policy carrying the count as a JSON string is set.
    await setRedrivePolicy(
      simAws,
      queueUrl,
      JSON.stringify({
        deadLetterTargetArn: deadLetterQueueArn,
        maxReceiveCount: "5",
      }),
    );

    // Then it is accepted, as real SQS accepts either form.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["RedrivePolicy"],
      }),
    );

    assertNonNullable(read.Attributes?.["RedrivePolicy"]);
  });

  it("refuses a redrive policy that is not JSON", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a redrive policy that is not JSON is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(simAws, queueUrl, "not json at all");
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a redrive policy that is not a JSON object", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a JSON array is set as the redrive policy.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(simAws, queueUrl, "[]");
    });

    // Then it is refused, since a redrive policy is a JSON map.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a redrive policy with no deadLetterTargetArn", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a policy naming no dead-letter queue is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({ maxReceiveCount: 3 }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a maxReceiveCount that is not an integer", async () => {
    // Given a queue and a dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When a fractional receive count is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({
          deadLetterTargetArn: deadLetterQueueArn,
          maxReceiveCount: 2.5,
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a maxReceiveCount that is missing", async () => {
    // Given a queue and a dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When a policy with no receive count is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({ deadLetterTargetArn: deadLetterQueueArn }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a maxReceiveCount below one", async () => {
    // Given a queue and a dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When a receive count of zero is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({
          deadLetterTargetArn: deadLetterQueueArn,
          maxReceiveCount: 0,
        }),
      );
    });

    // Then it is refused, as real SQS accepts one to a thousand.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a maxReceiveCount above a thousand", async () => {
    // Given a queue and a dead-letter queue.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When a receive count above the maximum is set as a string.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({
          deadLetterTargetArn: deadLetterQueueArn,
          maxReceiveCount: "1001",
        }),
      );
    });

    // Then it is refused.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a dead-letter queue that does not exist", async () => {
    // Given a queue and no dead-letter queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a policy naming a queue that is not there is set.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({
          deadLetterTargetArn: "arn:aws:sqs:us-east-1:123456789012:missing",
          maxReceiveCount: 3,
        }),
      );
    });

    // Then it is refused now, rather than losing messages later.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a dead-letter queue in another Account and Region", async () => {
    // Given a queue, and a queue of the same name in another scope.
    const { simAws, queueUrl } = await simAwsWithQueue();
    await simAws
      .account("222222222222")
      .region("eu-west-2")
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders-dlq" }));

    // When the queue is pointed at that other scope's queue.
    const error = await assertThrowsErrorAsync(async () => {
      await setRedrivePolicy(
        simAws,
        queueUrl,
        JSON.stringify({
          deadLetterTargetArn: "arn:aws:sqs:eu-west-2:222222222222:orders-dlq",
          maxReceiveCount: 3,
        }),
      );
    });

    // Then it is refused, as real SQS requires the two to share a scope.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
  });

  it("refuses a redrive policy naming a queue that does not exist yet at CreateQueue", async () => {
    // Given a simulated AWS with no queues on it.
    const simAws = new SimAws();

    // When a queue is created pointing at a dead-letter queue that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: {
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: "arn:aws:sqs:us-east-1:123456789012:missing",
              maxReceiveCount: 3,
            }),
          },
        }),
      );
    });

    // Then the queue is not created.
    assertInstanceOf(error, SimSqsInvalidParameterValue);
    assertUndefined(simAws.sqs().findQueue("orders"));
  });

  it("answers a repeated CreateQueue with the same redrive policy", async () => {
    // Given a queue created with a redrive policy.
    const { simAws, queueUrl, deadLetterQueueArn } =
      await simAwsWithDeadLetterQueue(3);

    // When the same queue is created again with the same policy.
    const again = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: deadLetterQueueArn,
            maxReceiveCount: 3,
          }),
        },
      }),
    );

    // Then it answers with the existing queue, as CreateQueue is idempotent.
    assertIdentical(again.QueueUrl, queueUrl);
  });

  it("refuses a repeated CreateQueue with a different redrive policy", async () => {
    // Given a queue created with a redrive policy.
    const { simAws, deadLetterQueueArn } = await simAwsWithDeadLetterQueue(3);

    // When the same queue is created again with a different receive count.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: {
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: deadLetterQueueArn,
              maxReceiveCount: 9,
            }),
          },
        }),
      );
    });

    // Then it is refused, as the attributes differ from the existing queue's.
    assertInstanceOf(error, SimSqsQueueNameExists);
  });

  it("refuses a repeated CreateQueue asking for a policy the queue has not got", async () => {
    // Given a queue with no redrive policy, and a dead-letter queue.
    const { simAws } = await simAwsWithDeadLetterQueue(3);
    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "invoices" }));

    // When it is created again with a redrive policy.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "invoices",
          Attributes: {
            RedrivePolicy: JSON.stringify({
              deadLetterTargetArn: "arn:aws:sqs:us-east-1:123456789012:missing",
              maxReceiveCount: 3,
            }),
          },
        }),
      );
    });

    // Then it is refused, since the existing queue has no policy to match.
    assertInstanceOf(error, SimSqsQueueNameExists);
  });
});
