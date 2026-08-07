/**
 * A simulated SNS topic an S3 Bucket can notify, which every test about the
 * topic destination needs before it can say anything about delivery.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import { CreateTopicCommand } from "@aws-sdk/client-sns";
import { assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { AwsRegionName } from "../../src/service/aws/sim-aws-region.js";
import { simIamPolicyDocumentFactory } from "../../src/service/iam/policy/sim-iam-policy-document.factory.js";

/**
 * The policy statement AWS documents for an S3 event notification destination
 * topic, which is what a Bucket has to be admitted by.
 */
export function simS3TopicPolicy(topicArn: string, sourceArn: string): string {
  return simIamPolicyDocumentFactory.make({
    Statement: {
      Principal: { Service: "s3.amazonaws.com" },
      Action: "sns:Publish",
      Resource: topicArn,
      Condition: { ArnLike: { "aws:SourceArn": sourceArn } },
    },
  });
}

/**
 * Where a topic lives and which Bucket its policy admits.
 */
export interface SimS3TopicOptions {
  readonly topicName?: string;
  readonly accountId?: string;
  readonly regionName?: AwsRegionName;

  /**
   * The Bucket ARN the topic policy admits. A topic asked for without one gets
   * no policy at all, which is what refuses every publish.
   */
  readonly sourceArn?: string;
}

/**
 * Create a topic, with a policy admitting S3 for one Bucket.
 */
export async function simS3NotificationTopic(
  simAws: SimAws,
  options: SimS3TopicOptions = {},
): Promise<string> {
  const {
    topicName = "uploads",
    accountId = simAws.defaultAccountId,
    regionName = simAws.defaultRegionName,
    sourceArn,
  } = options;
  const topicArn = `arn:aws:sns:${regionName}:${accountId}:${topicName}`;
  const created = await simAws
    .account(accountId)
    .region(regionName)
    .sns()
    .createTopic(
      new CreateTopicCommand({
        Name: topicName,
        ...(sourceArn !== undefined && {
          Attributes: { Policy: simS3TopicPolicy(topicArn, sourceArn) },
        }),
      }),
    );

  assertNonNullable(created.TopicArn, "CreateTopic answered with a topic ARN");

  return created.TopicArn;
}
