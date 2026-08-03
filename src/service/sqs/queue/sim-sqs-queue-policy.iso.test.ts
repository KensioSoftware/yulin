import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimSqsInvalidAttributeValue,
  SimSqsQueueNameExists,
} from "../error/sim-sqs.error.js";
import { simAwsWithQueue } from "../../../../test/sqs/queue-fixture.js";

const queueArn = "arn:aws:sqs:us-east-1:888888888888:orders";

/**
 * A queue policy admitting S3 to send to the queue, written out the way a
 * request carries it.
 */
function sendPolicy(sourceArn: string): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "s3.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: queueArn,
        Condition: { ArnLike: { "aws:SourceArn": sourceArn } },
      },
    ],
  });
}

describe("SQS queue policy attribute", () => {
  it("reports back the policy a queue was created with", async () => {
    // Given a queue created with a queue policy.
    const policy = sendPolicy("arn:aws:s3:::uploads");
    const { simAws, queueUrl } = await simAwsWithQueue({ Policy: policy });

    // When the policy is read back.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["Policy"],
      }),
    );

    // Then it is the string the queue was created with, rather than a
    // re-serialised version of it.
    assertIdentical(read.Attributes?.["Policy"], policy);
  });

  it("reports back a policy set through SetQueueAttributes", async () => {
    // Given a queue with no policy.
    const { simAws, queueUrl } = await simAwsWithQueue();
    const policy = sendPolicy("arn:aws:s3:::uploads");

    // When a policy is set on it.
    await simAws.sqs().setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: queueUrl,
        Attributes: { Policy: policy },
      }),
    );

    // Then it is reported back verbatim.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    assertIdentical(read.Attributes?.["Policy"], policy);
  });

  it("reports no policy for a queue that has none", async () => {
    // Given a queue created with no policy.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When every attribute is read.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );

    // Then the attribute is left out, as real SQS leaves out an attribute a
    // queue has no value for.
    assertUndefined(read.Attributes?.["Policy"]);
  });

  it("refuses a policy that is not JSON when it is set", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a policy that is not JSON is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: { Policy: "not a policy" },
        }),
      );
    });

    // Then it is refused there and then, rather than when it is first
    // evaluated.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
    assertStringIncludes(error.message, "for parameter Policy is invalid");
  });

  it("refuses a policy statement with no Action", async () => {
    // Given a queue.
    const { simAws, queueUrl } = await simAwsWithQueue();

    // When a policy whose statement names no Action is set.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().setQueueAttributes(
        new SetQueueAttributesCommand({
          QueueUrl: queueUrl,
          Attributes: {
            Policy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [{ Effect: "Allow", Resource: queueArn }],
            }),
          },
        }),
      );
    });

    // Then it is refused, as sim IAM refuses any other policy document without
    // one.
    assertInstanceOf(error, SimSqsInvalidAttributeValue);
    assertStringIncludes(error.message, "Action or NotAction");
  });

  it("answers a repeated CreateQueue naming the same policy", async () => {
    // Given a queue created with a policy.
    const policy = sendPolicy("arn:aws:s3:::uploads");
    const { simAws, queueUrl } = await simAwsWithQueue({ Policy: policy });

    // When the same queue is created again with the same policy, written out
    // with different whitespace.
    const indented = JSON.stringify(JSON.parse(policy), undefined, 2);
    const again = await simAws.sqs().createQueue(
      new CreateQueueCommand({
        QueueName: "orders",
        Attributes: { Policy: indented },
      }),
    );

    // Then it is the same queue, as CreateQueue is idempotent on real SQS.
    assertIdentical(again.QueueUrl, queueUrl);
  });

  it("refuses a repeated CreateQueue naming a different policy", async () => {
    // Given a queue created with a policy.
    const simAws = new SimAws();
    await simAwsWithQueue(
      { Policy: sendPolicy("arn:aws:s3:::uploads") },
      simAws,
    );

    // When the same queue is created again with a policy naming another
    // Bucket.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders",
          Attributes: { Policy: sendPolicy("arn:aws:s3:::reports") },
        }),
      );
    });

    // Then it is refused, as a queue with different attributes is.
    assertInstanceOf(error, SimSqsQueueNameExists);
  });
});
