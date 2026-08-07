import { assertInstanceOf, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import {
  simSnsOrdersQueueArn as queueArn,
  subscribeRefusal,
} from "../../../../../test/sns/subscription-fixture.js";
import {
  SimSnsInvalidParameterException,
  SimSnsUnsimulatedInputException,
} from "../../error/sim-sns.error.js";

/**
 * Subscribe the `orders-queue` with attributes, answering with what it threw.
 */
async function refusalFor(attributes: Record<string, string>): Promise<Error> {
  return subscribeRefusal({
    Protocol: "sqs",
    Endpoint: queueArn,
    Attributes: attributes,
  });
}

describe("SNS subscription attribute validation", () => {
  it("refuses a subscription attribute that is not simulated", async () => {
    // Given a topic, when each unsimulated subscription attribute is set at
    // subscribe time.
    const refusals = await Promise.all(
      [
        { DeliveryPolicy: JSON.stringify({ healthyRetryPolicy: {} }) },
        { RedrivePolicy: JSON.stringify({ deadLetterTargetArn: queueArn }) },
        { SubscriptionRoleArn: "arn:aws:iam::888888888888:role/Firehose" },
        { ReplayPolicy: JSON.stringify({}) },
      ].map(async (attributes) => refusalFor(attributes)),
    );

    // Then each is refused with its reason, rather than held and never acted
    // on.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsUnsimulatedInputException);
      assertStringIncludes(error.message, "is not simulated");
    }
  });

  it("refuses a RawMessageDelivery value that is not a boolean", async () => {
    // Given a topic, when the attribute is set to something else.
    const error = await refusalFor({ RawMessageDelivery: "True" });

    // Then it is refused rather than taken as false, which would leave the
    // subscription delivering the envelope while the request asked for raw.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(error.message, "must be true or false");
  });

  it("refuses an attribute name real SNS does not have", async () => {
    // Given a topic, when an invented attribute is set.
    const error = await refusalFor({ RawDelivery: "true" });

    // Then it is refused the way real SNS refuses one.
    assertInstanceOf(error, SimSnsInvalidParameterException);
    assertStringIncludes(
      error.message,
      "is not a subscription attribute that can be set",
    );
  });
});
