import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simAwsWithPublishingRole,
  simAwsWithTopicPolicy,
  simSnsOrdersTopicArn as topicArn,
} from "../../../../../test/sns/topic-fixture.js";
import { SimSnsAuthorizationErrorException } from "../../error/sim-sns.error.js";

const callerAccountId = "222222222222";

/**
 * A topic policy granting another Account's Role.
 */
const rolePolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: `arn:aws:iam::${callerAccountId}:role/OrderPublisher` },
      Action: "SNS:Publish",
      Resource: topicArn,
    },
  ],
});

describe("SNS cross-account topic policy authorization", () => {
  it("admits another Account's Role when both sides allow it", async () => {
    // Given a topic whose policy grants another Account's Role, and that
    // Role's own Account allowing it too.
    const simAws = await simAwsWithTopicPolicy(rolePolicy);
    const arn = await simAwsWithPublishingRole(simAws, callerAccountId, true);

    // When that Role publishes to the topic.
    const published = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }), {
        caller: { kind: "arn", arn },
      });

    // Then it is allowed, which is what a topic policy is for.
    assertNonNullable(published.MessageId);
  });

  it("refuses another Account's Role its own Account does not allow", async () => {
    // Given the same topic policy, and nothing in that Role's own Account
    // allowing the publish.
    const simAws = await simAwsWithTopicPolicy(rolePolicy);
    const arn = await simAwsWithPublishingRole(simAws, callerAccountId, false);

    // When that Role publishes to the topic.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: { kind: "arn", arn } },
        );
    });

    // Then it is denied: real AWS requires the caller's Account to allow the
    // action as well as the topic policy.
    assertInstanceOf(error, SimSnsAuthorizationErrorException);
  });
});
