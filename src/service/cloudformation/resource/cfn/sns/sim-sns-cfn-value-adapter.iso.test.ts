import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";

const topicResources = {
  OrdersTopic: {
    Type: "AWS::SNS::Topic",
    Properties: { TopicName: "orders" },
  },
};

/**
 * Deploy a topic and read one Output of the Stack it deployed into.
 */
async function outputValue(
  outputs: Record<string, SimCfnTemplateValue>,
): Promise<SimCfnTemplateValue | undefined> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        ...topicResources,
        OrdersTopicPolicy: {
          Type: "AWS::SNS::TopicPolicy",
          Properties: {
            Topics: [{ Ref: "OrdersTopic" }],
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "s3.amazonaws.com" },
                  Action: "sns:Publish",
                  Resource: "*",
                },
              ],
            },
          },
        },
      },
      Outputs: Object.fromEntries(
        Object.entries(outputs).map(([name, value]) => [
          name,
          { Value: value },
        ]),
      ),
    },
  });

  return stack.outputs.get(Object.keys(outputs)[0] ?? "")?.value;
}

describe("Sim SNS CloudFormation value adapter", () => {
  it("refuses an AWS::SNS::Topic attribute that is not one", async () => {
    // Given a template asking for an attribute AWS::SNS::Topic does not have.
    const error = await assertThrowsErrorAsync(async () => {
      await outputValue({
        Nope: { "Fn::GetAtt": ["OrdersTopic", "DisplayName"] },
      });
    });

    // Then the deployment fails saying so, rather than answering with a
    // stand-in value a test would read as the real thing.
    assertStringIncludes(
      error.message,
      "Unsupported AWS::SNS::Topic attribute DisplayName",
    );
  });

  it("answers an AWS::SNS::Subscription Ref and Arn with the subscription ARN", async () => {
    // Given a template reading a subscription both ways it can. The
    // subscription ARN is the Resource's physical id, so Ref and the one
    // Fn::GetAtt attribute it has are the same string.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...topicResources,
          FulfilmentQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "fulfilment" },
          },
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: {
              TopicArn: { Ref: "OrdersTopic" },
              Protocol: "sqs",
              Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
            },
          },
        },
        Outputs: {
          SubscriptionRef: { Value: { Ref: "FulfilmentSubscription" } },
          SubscriptionArn: {
            Value: { "Fn::GetAtt": ["FulfilmentSubscription", "Arn"] },
          },
        },
      },
    });

    const subscriptionArn = stack.outputs.get("SubscriptionArn")?.value;
    assertIdentical(
      stack.outputs.get("SubscriptionRef")?.value,
      subscriptionArn,
    );
    assertTypeString(subscriptionArn);
    assertNonNullable(simAws.sns().findSubscription(subscriptionArn));
  });

  it("refuses an AWS::SNS::Subscription attribute that is not Arn", async () => {
    // Given a template asking for an attribute a subscription does not have.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            ...topicResources,
            FulfilmentQueue: {
              Type: "AWS::SQS::Queue",
              Properties: { QueueName: "fulfilment" },
            },
            FulfilmentSubscription: {
              Type: "AWS::SNS::Subscription",
              Properties: {
                TopicArn: { Ref: "OrdersTopic" },
                Protocol: "sqs",
                Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
              },
            },
          },
          Outputs: {
            Nope: {
              Value: { "Fn::GetAtt": ["FulfilmentSubscription", "Endpoint"] },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Unsupported AWS::SNS::Subscription attribute Endpoint",
    );
  });

  it("leaves an AWS::SNS::TopicPolicy Ref to the default adapter", async () => {
    // Given a template referencing the topic policy Resource. It is backed by
    // one of the topics it names, since a topic policy is nothing but an
    // attribute of those topics, so answering the Ref with that topic's ARN
    // would hand back another Resource's identity.
    const value = await outputValue({
      PolicyRef: { Ref: "OrdersTopicPolicy" },
    });

    assertIdentical(value, "OrdersTopicPolicy");
  });
});
