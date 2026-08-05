import { AsyncMappedFactory } from "@kensio/part-factory";
import { assertNonNullable } from "@kensio/smartass";
import {
  CreateQueueCommand,
  SetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";
import { mediaBucketName, mediaQueueName } from "./media-pipeline-names.js";
import type { SimSqsQueue } from "../../src/service/sqs/queue/sim-sqs-queue.js";

/**
 * What the pipeline asks for when it wants a queue a Bucket can announce on.
 */
export interface MediaScreenedQueueInput {
  readonly queueName: string;
  /** The Bucket whose notifications the queue accepts, and no other. */
  readonly sourceBucketName: string;
}

/**
 * Creates the queue screened uploads are announced on, and the policy that
 * admits S3 to it.
 *
 * ```typescript
 * const queue = await mediaScreenedQueueFactory.make({}, simAws);
 * ```
 *
 * The policy is the whole of what admits S3, which owns no identity policies
 * anywhere, so creating the queue without one leaves a queue nothing can
 * notify.
 */
export const mediaScreenedQueueFactory = new AsyncMappedFactory<
  MediaScreenedQueueInput,
  SimSqsQueue,
  SimAws
>(
  () => ({
    queueName: mediaQueueName,
    sourceBucketName: mediaBucketName,
  }),
  async (input, simAws) => {
    const simSqs = simAws.sqs();

    const created = await simSqs.createQueue(
      new CreateQueueCommand({ QueueName: input.queueName }),
    );
    assertNonNullable(created.QueueUrl, "CreateQueue answered with a URL");

    const queue = simSqs.findQueue(input.queueName);
    assertNonNullable(queue, `Simulated SQS holds ${input.queueName}`);

    await simSqs.setQueueAttributes(
      new SetQueueAttributesCommand({
        QueueUrl: created.QueueUrl,
        Attributes: {
          Policy: simIamPolicyDocumentFactory.make({
            Statement: {
              Principal: { Service: "s3.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: queue.arn.value,
              Condition: {
                ArnLike: {
                  "aws:SourceArn": `arn:aws:s3:::${input.sourceBucketName}`,
                },
              },
            },
          }),
        },
      }),
    );

    return queue;
  },
);
