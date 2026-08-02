import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../../../aws/sim-aws.js";
import type { SimIam } from "../../../../../sim-iam.js";

const queueArn = "arn:aws:sqs:eu-west-2:111111111111:orders";

/**
 * Create a Role whose inline policy allows sending to a queue only for
 * requests whose `aws:SourceArn` matches the given pattern.
 */
async function senderRole(simIam: SimIam, pattern: string): Promise<string> {
  const roleCreation = await simIam.createRole(
    new CreateRoleCommand({
      RoleName: "OrderSender",
      AssumeRolePolicyDocument: JSON.stringify({
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { AWS: `arn:aws:iam::${simIam.accountId}:root` },
        },
      }),
    }),
  );

  await simIam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderSender",
      PolicyName: "SendOrders",
      PolicyDocument: JSON.stringify({
        Statement: {
          Effect: "Allow",
          Action: "sqs:SendMessage",
          Resource: queueArn,
          Condition: { ArnEquals: { "aws:SourceArn": pattern } },
        },
      }),
    }),
  );

  return roleCreation.Role.Arn;
}

describe("sim IAM ArnEquals authorization", () => {
  it("allows a request whose source ARN the identity policy names", async () => {
    // Given a Role allowed to send only on behalf of one topic
    const simAws = new SimAws();
    const simIam = simAws.iam();
    const roleArn = await senderRole(
      simIam,
      "arn:aws:sns:eu-west-2:111111111111:orders-topic",
    );

    // When the request supplies that topic as its source
    const decision = simIam.authorize({
      action: "sqs:SendMessage",
      resource: queueArn,
      caller: { kind: "arn", arn: roleArn },
      conditionContext: {
        "aws:SourceArn": "arn:aws:sns:eu-west-2:111111111111:orders-topic",
      },
    });

    // Then the identity policy allows it
    assertTrue(decision.isAllowed);
  });

  it("accepts wildcards, as AWS documents ArnEquals doing", async () => {
    // Given a Role whose grant wildcards the Account and the resource name,
    // which ArnEquals allows: AWS documents it as behaving like ArnLike
    const simAws = new SimAws();
    const simIam = simAws.iam();
    const roleArn = await senderRole(
      simIam,
      "arn:aws:sns:eu-west-2:*:orders-*",
    );

    // When the request supplies a source ARN fitting the pattern
    const decision = simIam.authorize({
      action: "sqs:SendMessage",
      resource: queueArn,
      caller: { kind: "arn", arn: roleArn },
      conditionContext: {
        "aws:SourceArn": "arn:aws:sns:eu-west-2:222222222222:orders-topic",
      },
    });

    // Then it is allowed
    assertTrue(decision.isAllowed);
  });

  it("does not allow a request from another source", async () => {
    // Given a Role allowed to send only on behalf of one topic
    const simAws = new SimAws();
    const simIam = simAws.iam();
    const roleArn = await senderRole(
      simIam,
      "arn:aws:sns:eu-west-2:111111111111:orders-topic",
    );

    // When the request names a different topic
    const decision = simIam.authorize({
      action: "sqs:SendMessage",
      resource: queueArn,
      caller: { kind: "arn", arn: roleArn },
      conditionContext: {
        "aws:SourceArn": "arn:aws:sns:eu-west-2:111111111111:refunds-topic",
      },
    });

    // Then the condition does not match, so nothing allows the request
    assertTrue(decision.isImplicitDeny);
  });
});
