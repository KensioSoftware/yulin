/**
 * A simulated AWS with one topic on it, which nearly every SNS test needs
 * before it can say anything about publishing.
 *
 * This lives under `test/` for the same reasons as `test/sqs/`: eslint rejects
 * a test file that exports helpers alongside its own `describe` calls, and
 * `test/**` is type-checked with everything else, excluded from the published
 * build, not collected as a suite, and not counted in coverage.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { CreateTopicCommand } from "@aws-sdk/client-sns";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";

/**
 * One simulated AWS and the ARN of the one topic on it.
 */
export interface SimSnsTopicFixture {
  readonly simAws: SimAws;
  readonly topicArn: string;
}

/**
 * Make a simulated AWS holding one topic named `orders`.
 */
export async function simAwsWithTopic(
  attributes?: Record<string, string>,
  existing?: SimAws,
): Promise<SimSnsTopicFixture> {
  const simAws = existing ?? new SimAws();
  const created = await simAws.sns().createTopic(
    new CreateTopicCommand({
      Name: "orders",
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );

  assertNonNullable(created.TopicArn, "CreateTopic answered with a topic ARN");

  return { simAws, topicArn: created.TopicArn };
}

/**
 * The ARN the `orders` topic has in the default Account and Region.
 */
export const simSnsOrdersTopicArn = "arn:aws:sns:us-east-1:888888888888:orders";

/**
 * The ARN the `orders` topic has in a simulation's own default scope.
 */
function ordersTopicArn(simAws: SimAws): string {
  return `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;
}

/**
 * Make a simulated AWS holding one topic named `orders`, carrying the topic
 * policy a test is about.
 */
export async function simAwsWithTopicPolicy(policy?: string): Promise<SimAws> {
  if (policy === undefined) {
    const withoutPolicy = await simAwsWithTopic();

    return withoutPolicy.simAws;
  }

  const withPolicy = await simAwsWithTopic({ Policy: policy });

  return withPolicy.simAws;
}

/**
 * Make a Role in another Account, with or without an identity policy of its own
 * allowing it to publish to the `orders` topic.
 *
 * A caller from another Account needs both sides to allow the request, so this
 * is the half a topic policy cannot supply.
 */
export async function simAwsWithPublishingRole(
  simAws: SimAws,
  accountId: string,
  allowed: boolean,
): Promise<string> {
  const iam = simAws.account(accountId).iam();
  const topicArn = ordersTopicArn(simAws);
  const role = await iam.createRole(
    new CreateRoleCommand({
      RoleName: "OrderPublisher",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (allowed) {
    await iam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "OrderPublisher",
        PolicyName: "PublishOrders",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "sns:Publish",
            Resource: topicArn,
          },
        }),
      }),
    );
  }

  return role.Role.Arn;
}
