import { GetSubscriptionAttributesCommand } from "@aws-sdk/client-sns";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { subscribeFunction } from "../../../../test/sns/function-fixture.js";
import { subscribeRefusal } from "../../../../test/sns/subscription-fixture.js";
import { simAwsWithTopic } from "../../../../test/sns/topic-fixture.js";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * Endpoints that are not a Lambda function ARN, one of each way to not be one.
 *
 * The queue ARN is here because the protocol decides what the endpoint has to
 * be: an SQS queue is a fine endpoint over `sqs` and no endpoint at all over
 * `lambda`.
 */
const endpointsThatAreNotFunctions = [
  "https://example.com/orders",
  "arn:aws:lambda:us-east-1:888888888888:layer:shared",
  "arn:aws:sqs:us-east-1:888888888888:orders-queue",
  "arn:aws:lambda:us-east-1:888888888888:function:",
  "",
];

/**
 * Subscribe an endpoint over the lambda protocol, answering with what it threw.
 */
async function functionEndpointRefusal(
  endpoint: string | undefined,
): Promise<Error> {
  return subscribeRefusal({ Protocol: "lambda", Endpoint: endpoint });
}

describe("The endpoint of a lambda subscription", () => {
  it("refuses an endpoint that is not a Lambda function ARN", async () => {
    // Given a topic.
    // When each is subscribed over the lambda protocol.
    const refusals = await Promise.all(
      [...endpointsThatAreNotFunctions, undefined].map(async (endpoint) =>
        functionEndpointRefusal(endpoint),
      ),
    );

    // Then each is refused, since a lambda subscription invokes a function and
    // none of these names one.
    for (const error of refusals) {
      assertInstanceOf(error, SimSnsInvalidParameterException);
      assertStringIncludes(error.message, "is not a Lambda function ARN");
    }
  });

  it("takes a qualified function ARN naming a version or an alias", async () => {
    // Given a topic.
    const { simAws, topicArn } = await simAwsWithTopic();

    // When a function alias is subscribed.
    const subscriptionArn = await subscribeFunction(
      simAws,
      topicArn,
      "arn:aws:lambda:us-east-1:888888888888:function:orders:PROD",
    );

    // Then the alias is the endpoint, and the qualifier is kept rather than
    // read off to leave the unqualified function subscribed.
    const attributes = await simAws.sns().getSubscriptionAttributes(
      new GetSubscriptionAttributesCommand({
        SubscriptionArn: subscriptionArn,
      }),
    );

    assertIdentical(
      attributes.Attributes?.["Endpoint"],
      "arn:aws:lambda:us-east-1:888888888888:function:orders:PROD",
    );
  });
});
