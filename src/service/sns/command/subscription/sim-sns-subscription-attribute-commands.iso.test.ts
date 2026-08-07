import {
  GetSubscriptionAttributesCommand,
  SetSubscriptionAttributesCommand,
} from "@aws-sdk/client-sns";
import {
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { simAwsWithSubscription } from "../../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import type { SimAws } from "../../../aws/sim-aws.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

/**
 * Assert what RawMessageDelivery a subscription is currently reporting.
 */
async function assertRawMessageDelivery(
  simAws: SimAws,
  subscriptionArn: string,
  expected: string,
): Promise<void> {
  const read = await simAws.sns().getSubscriptionAttributes(
    new GetSubscriptionAttributesCommand({
      SubscriptionArn: subscriptionArn,
    }),
  );

  assertNonNullable(read.Attributes);
  assertObjectMatches(read.Attributes, { RawMessageDelivery: expected });
}

describe("SNS subscription attribute commands", () => {
  it("turns raw message delivery on and off again", async () => {
    // Given a subscription delivering the SNS envelope.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    await assertRawMessageDelivery(simAws, subscriptionArn, "false");

    // When raw delivery is turned on.
    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );

    // Then the subscription reports it, and turning it off again puts it back.
    await assertRawMessageDelivery(simAws, subscriptionArn, "true");

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "false",
      }),
    );

    await assertRawMessageDelivery(simAws, subscriptionArn, "false");
  });

  it("refuses an attribute that is not simulated, leaving the rest alone", async () => {
    // Given a subscription with raw delivery turned on.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "RawMessageDelivery",
        AttributeValue: "true",
      }),
    );

    // When a dead-letter queue is set on it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setSubscriptionAttributes(
        new SetSubscriptionAttributesCommand({
          SubscriptionArn: subscriptionArn,
          AttributeName: "RedrivePolicy",
          AttributeValue: JSON.stringify({
            deadLetterTargetArn: "arn:aws:sqs:us-east-1:888888888888:dead",
          }),
        }),
      );
    });

    // Then it is refused with its reason, and what was already set stands.
    assertInstanceOf(error, SimSnsUnsimulatedInputException);
    assertStringIncludes(error.message, "dead-letter queues are not simulated");
    await assertRawMessageDelivery(simAws, subscriptionArn, "true");
  });

  it("reports the filter policy it was set with", async () => {
    // Given a subscription with no filter policy.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();
    const before = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );

    assertUndefined(before.Attributes?.["FilterPolicy"]);

    // When a policy is set on it.
    const policy = JSON.stringify({ type: ["order"] });

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "FilterPolicy",
        AttributeValue: policy,
      }),
    );

    // Then it comes back as the document it was set with, with the scope it is
    // read under alongside it.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );

    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, {
      FilterPolicy: policy,
      FilterPolicyScope: "MessageAttributes",
    });
  });

  it("reports the scope a filter policy is read under", async () => {
    // Given a subscription filtering on the message body.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "FilterPolicyScope",
        AttributeValue: "MessageBody",
      }),
    );

    await simAws.sns().setSubscriptionAttributes(
      new SetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
        AttributeName: "FilterPolicy",
        AttributeValue: JSON.stringify({ customer: { tier: ["gold"] } }),
      }),
    );

    // When the subscription is read back.
    const read = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );

    // Then the scope is reported with the policy it applies to.
    assertNonNullable(read.Attributes);
    assertObjectMatches(read.Attributes, { FilterPolicyScope: "MessageBody" });
  });

  it("requires an attribute name", async () => {
    // Given a subscription.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    // When an attribute is set without naming one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setSubscriptionAttributes(
        new SetSubscriptionAttributesCommand({
          SubscriptionArn: subscriptionArn,
          AttributeName: undefined,
          AttributeValue: "true",
        }),
      );
    });

    // Then the request is refused.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "AttributeName is required");
  });

  it("requires a subscription ARN", async () => {
    // Given a simulated SNS.
    const { simAws } = await simAwsWithTopic();

    // When a subscription's attributes are read without naming one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .getSubscriptionAttributes(
          new GetSubscriptionAttributesCommand({ SubscriptionArn: undefined }),
        );
    });

    // Then the request is refused.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "SubscriptionArn is required");
  });

  it("refuses clearing RawMessageDelivery, which has no empty value", async () => {
    // Given a subscription.
    const { simAws, subscriptionArn } = await simAwsWithSubscription();

    // When the attribute is set with no value, which is how SNS is told to
    // clear one.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sns().setSubscriptionAttributes(
        new SetSubscriptionAttributesCommand({
          SubscriptionArn: subscriptionArn,
          AttributeName: "RawMessageDelivery",
          AttributeValue: undefined,
        }),
      );
    });

    // Then it is refused, since the subscription is either raw or it is not.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "must be true or false");
  });
});
