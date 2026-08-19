import { PublishCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";
import { ordersTopic } from "./sim-cfn-sam-event-source.resources.js";

/**
 * The part of the SNS event document these tests read.
 */
interface SnsEventDocument {
  readonly Records: readonly [{ readonly Sns: { readonly Message: string } }];
}

/**
 * A SAM template subscribing the function to the topic it declares.
 */
function subscribedTemplate(
  eventProperties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return simCfnSamFunctionTemplateFactory.make({
    functionProperties: {
      Events: {
        Orders: {
          Type: "SNS",
          Properties: { Topic: { Ref: "OrdersTopic" }, ...eventProperties },
        },
      },
    },
    resources: { OrdersTopic: ordersTopic },
  });
}

/**
 * Deploy a template, publish one message to the topic it declares, and answer
 * with what the bound handler was given.
 */
async function publishedMessages(
  template: CfnTemplateBodyRecord,
  attributes: SimCfnTemplateValueRecord = {},
): Promise<readonly SnsEventDocument[]> {
  const simAws = new SimAws();
  const received: SnsEventDocument[] = [];

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template,
    bindings: [
      {
        logicalId: samFunctionTemplateLogicalId,
        handler: (event: SnsEventDocument): undefined => {
          received.push(event);

          return undefined;
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  await simAws.sns().publish(
    new PublishCommand({
      TopicArn: `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`,
      Message: "order-1",
      ...attributes,
    }),
  );
  await simAws.backgroundTasksComplete();

  assertArrayLength(simAws.sns().deliveryFailures, 0);

  return received;
}

describe("SAM SNS event expansion", () => {
  it("delivers a publish on the topic the event names to the function", async () => {
    // Given a SAM function with an SNS event naming a topic the template
    // declares

    // When it is deployed and a message is published to that topic
    const received = await publishedMessages(subscribedTemplate({}));

    // Then the message reached the bound handler, which means the event both
    // subscribed the function and granted SNS the permission to invoke it
    assertArrayLength(received, 1);
    assertIdentical(received[0].Records[0].Sns.Message, "order-1");
  });

  it("filters what reaches the function by the event's FilterPolicy", async () => {
    // Given an SNS event subscribing only to the messages it wants

    // When a message the policy does not match is published
    const unmatched = await publishedMessages(
      subscribedTemplate({ FilterPolicy: { region: ["eu-west-2"] } }),
      {
        MessageAttributes: {
          region: { DataType: "String", StringValue: "us-east-1" },
        },
      },
    );

    // Then it did not reach the function
    assertArrayLength(unmatched, 0);

    // And a message the policy does match does reach it
    const matched = await publishedMessages(
      subscribedTemplate({ FilterPolicy: { region: ["eu-west-2"] } }),
      {
        MessageAttributes: {
          region: { DataType: "String", StringValue: "eu-west-2" },
        },
      },
    );

    assertArrayLength(matched, 1);
  });

  it("expands nothing for an event naming no topic", async () => {
    // Given an SNS event that names no topic to subscribe to
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "topicless-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: { Orders: { Type: "SNS", Properties: {} } },
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the function deployed with nothing subscribed for it
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(
      stack.getResource(`${samFunctionTemplateLogicalId}OrdersSnsSubscription`),
    );
    assertArrayLength(stack.skippedResources, 0);
  });
});
