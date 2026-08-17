import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Deploy one AWS::SNS::Topic and hand back whatever the deployment failed
 * with.
 *
 * A refusal has to fail the Resource rather than skip it. Sim CloudFormation
 * steps over a Resource whose error reads as unsupported, and stepping over a
 * topic leaves a stack that looks deployed with nothing publishing anywhere.
 */
async function deployTopic(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: { Type: "AWS::SNS::Topic", Properties: properties },
        },
      },
    });
  });
}

/**
 * Deploy one AWS::SNS::Subscription against a deployed topic and hand back
 * whatever the deployment failed with.
 */
async function deploySubscription(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: { TopicArn: { Ref: "OrdersTopic" }, ...properties },
          },
        },
      },
    });
  });
}

describe("AWS::SNS::Topic validation", () => {
  it("fails a FIFO topic rather than creating a standard one", async () => {
    // Given a template asking for a FIFO topic, which is not simulated.
    const error = await deployTopic({ TopicName: "orders", FifoTopic: true });

    // Then the Resource is invalid, with SNS's own reason inside it, rather
    // than unsupported and stepped over.
    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::Topic Resource OrdersTopic",
    );
    assertStringIncludes(
      error.message,
      "The topic attribute FifoTopic is not simulated",
    );
  });

  it("fails a topic asking for server-side encryption", async () => {
    // Given a template naming a KMS key for the topic.
    const error = await deployTopic({
      TopicName: "orders",
      KmsMasterKeyId: "alias/aws/sns",
    });

    // Then it fails rather than deploying a topic that is not encrypted.
    assertStringIncludes(
      error.message,
      "The topic attribute KmsMasterKeyId is not simulated",
    );
  });

  it("fails a topic carrying tags", async () => {
    // Given a template tagging the topic.
    const error = await deployTopic({
      TopicName: "orders",
      Tags: [{ Key: "team", Value: "orders" }],
    });

    // Then it fails, since a dropped tag would leave the topic looking tagged
    // to the template that wrote it.
    assertStringIncludes(
      error.message,
      "Tags is a real AWS::SNS::Topic property simulated SNS does not act on",
    );
  });

  it("fails a topic asking for delivery status logging", async () => {
    // Given a template configuring delivery status logging, which would become
    // fifteen separate attributes.
    const error = await deployTopic({
      TopicName: "orders",
      DeliveryStatusLogging: [
        { Protocol: "sqs", SuccessFeedbackSampleRate: 100 },
      ],
    });

    assertStringIncludes(
      error.message,
      "DeliveryStatusLogging is a real AWS::SNS::Topic property simulated SNS does not act on",
    );
  });

  it("fails a topic carrying a property AWS::SNS::Topic does not have", async () => {
    // Given a template with a misspelled property.
    const error = await deployTopic({
      TopicName: "orders",
      DisplayNam: "Orders",
    });

    // Then the topic is not deployed silently missing the setting.
    assertStringIncludes(
      error.message,
      "DisplayNam is not a property of AWS::SNS::Topic",
    );
  });

  it("fails a TopicName that is not a string", async () => {
    const error = await deployTopic({ TopicName: 7 });

    assertStringIncludes(error.message, "TopicName must be a string");
  });

  it("fails a topic name simulated SNS refuses", async () => {
    // Given a name ending in .fifo, which names a FIFO topic.
    const error = await deployTopic({ TopicName: "orders.fifo" });

    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::Topic Resource OrdersTopic",
    );
    assertStringIncludes(error.message, "names a FIFO topic");
  });

  it("fails an inline Subscription list that is not a list", async () => {
    const error = await deployTopic({
      TopicName: "orders",
      Subscription: { Protocol: "sqs", Endpoint: "x" },
    });

    assertStringIncludes(
      error.message,
      "Subscription must be a list of subscriptions",
    );
  });

  it("fails an inline Subscription entry that is not an object", async () => {
    const error = await deployTopic({
      TopicName: "orders",
      Subscription: ["sqs"],
    });

    assertStringIncludes(
      error.message,
      "each entry of Subscription must be an object",
    );
  });

  it("fails an inline Subscription entry asking for a filter policy", async () => {
    // Given an inline entry carrying something an inline entry cannot carry.
    // Real CloudFormation gives one a Protocol and an Endpoint and nothing
    // else, so the separate Resource is the only place a filter policy goes.
    const error = await deployTopic({
      TopicName: "orders",
      Subscription: [
        {
          Protocol: "sqs",
          Endpoint: "arn:aws:sqs:us-east-1:888888888888:fulfilment",
          FilterPolicy: { region: ["eu"] },
        },
      ],
    });

    assertStringIncludes(
      error.message,
      "an entry of Subscription carries FilterPolicy",
    );
  });

  it("fails an inline Subscription entry with no Endpoint", async () => {
    const error = await deployTopic({
      TopicName: "orders",
      Subscription: [{ Protocol: "sqs" }],
    });

    assertStringIncludes(
      error.message,
      "each entry of Subscription requires Endpoint to be a string",
    );
  });
});

describe("AWS::SNS::Subscription validation", () => {
  it("fails a subscription with no Protocol", async () => {
    const error = await deploySubscription({ Endpoint: "x" });

    assertStringIncludes(
      error.message,
      "Protocol is required and must be a string",
    );
  });

  it("leaves an absent Endpoint to Subscribe to refuse", async () => {
    // Given a subscription with no Endpoint. Real CloudFormation leaves the
    // property optional, because a protocol such as application carries the
    // destination elsewhere, so the refusal belongs to the protocol.
    const error = await deploySubscription({ Protocol: "sqs" });

    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::Subscription Resource FulfilmentSubscription",
    );
    assertStringIncludes(error.message, "Endpoint");
  });

  it("fails an sms subscription whose Endpoint is not a phone number", async () => {
    // Given a template texting something that is not an E.164 number.
    const error = await deploySubscription({
      Protocol: "sms",
      Endpoint: "555-0100",
    });

    // Then the Resource is invalid rather than deployed as a subscription that
    // would text nobody.
    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::Subscription Resource FulfilmentSubscription",
    );
    assertStringIncludes(error.message, "is not an E.164 phone number");
  });

  it("fails a subscription whose Endpoint is not a string", async () => {
    const error = await deploySubscription({ Protocol: "sqs", Endpoint: 7 });

    assertStringIncludes(error.message, "Endpoint must be a string");
  });

  it("fails a subscription naming a Region of its own", async () => {
    // Given a cross-region subscription, which simulated SNS has nothing to do
    // with: the topic ARN already says where the topic is.
    const error = await deploySubscription({
      Protocol: "sqs",
      Endpoint: "arn:aws:sqs:us-east-1:123456789012:fulfilment",
      Region: "us-east-1",
    });

    assertStringIncludes(
      error.message,
      "Region is a real AWS::SNS::Subscription property simulated SNS does not act on",
    );
  });

  it("fails a subscription asking for a dead-letter queue", async () => {
    // Given a redrive policy, which is a real subscription attribute this
    // simulation gives no behaviour to.
    const error = await deploySubscription({
      Protocol: "sqs",
      Endpoint: "arn:aws:sqs:us-east-1:123456789012:fulfilment",
      RedrivePolicy: { deadLetterTargetArn: "arn:aws:sqs:x:y:dlq" },
    });

    assertStringIncludes(
      error.message,
      "The subscription attribute RedrivePolicy is not simulated",
    );
  });

  it("fails a subscription carrying a property AWS::SNS::Subscription does not have", async () => {
    const error = await deploySubscription({
      Protocol: "sqs",
      Endpoint: "arn:aws:sqs:us-east-1:123456789012:fulfilment",
      RawMessageDeliver: true,
    });

    assertStringIncludes(
      error.message,
      "RawMessageDeliver is not a property of AWS::SNS::Subscription",
    );
  });

  it("fails a filter policy simulated SNS refuses", async () => {
    // Given a policy using the cidr operator, which is the one operator real
    // SNS has that this does not.
    const error = await deploySubscription({
      Protocol: "sqs",
      Endpoint: "arn:aws:sqs:eu-west-2:123456789012:fulfilment",
      FilterPolicy: { source: [{ cidr: "10.0.0.0/24" }] },
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::Subscription Resource FulfilmentSubscription",
    );
    assertStringIncludes(error.message, "cidr");
  });
});
