import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const onCall = "+15550100";

const ordersTopicArn = "arn:aws:sns:us-east-1:888888888888:orders";

/**
 * Deploy a template holding the Resources, then publish one alert to the topic
 * it created.
 */
async function deployAndAlert(
  resources: Record<string, SimCfnTemplateValue>,
): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws.cloudFormation().deployTemplate({
    stackName: "alerts-stack",
    template: { Resources: resources },
  });

  await simAws.sns().publish(
    new PublishCommand({
      TopicArn: ordersTopicArn,
      Message: "Disk full",
    }),
  );
  await simAws.backgroundTasksComplete();

  return simAws;
}

describe("SNS CloudFormation sms Subscription deployment", () => {
  it("texts the number an AWS::SNS::Subscription names", async () => {
    // Given a template subscribing a phone number to a topic as its own
    // Resource, the way CDK emits a subscription.
    const simAws = await deployAndAlert({
      OrdersTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "orders" },
      },
      OnCallSubscription: {
        Type: "AWS::SNS::Subscription",
        Properties: {
          TopicArn: { Ref: "OrdersTopic" },
          Protocol: "sms",
          Endpoint: onCall,
        },
      },
    });

    // Then the published message was texted to it, naming the subscription the
    // template created.
    const [sms] = simAws.sns().sentSmsMessages();
    const [subscription] = simAws.sns().topicSubscriptions("orders");

    assertNonNullable(sms);
    assertNonNullable(subscription);
    assertIdentical(sms.phoneNumber, onCall);
    assertIdentical(sms.message, "Disk full");
    assertIdentical(sms.subscriptionArn, subscription.arn.value);
  });

  it("texts the number a topic subscribes inline", async () => {
    // Given a template using the Subscription property of the topic rather
    // than a Resource of its own.
    const simAws = await deployAndAlert({
      OrdersTopic: {
        Type: "AWS::SNS::Topic",
        Properties: {
          TopicName: "orders",
          Subscription: [{ Protocol: "sms", Endpoint: onCall }],
        },
      },
    });

    // Then the inline subscription is there and was texted.
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 1);

    const [sms] = simAws.sns().sentSmsMessages();

    assertIdentical(sms?.phoneNumber, onCall);
    assertIdentical(sms.topicArn, ordersTopicArn);
  });
});
