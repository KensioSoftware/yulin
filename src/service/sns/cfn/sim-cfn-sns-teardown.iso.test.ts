import { GetTopicAttributesCommand } from "@aws-sdk/client-sns";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { deployedResourceObject } from "../../cloudformation/stack/sim-cfn-stack.fixture.js";

const policyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "s3.amazonaws.com" },
      Action: "sns:Publish",
      Resource: "*",
    },
  ],
};

describe("SNS CloudFormation Resource teardown", () => {
  it("deletes a topic after the subscription and policy declared on it", async () => {
    // Given a deployed topic with a subscription and a topic policy on it.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
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
          OrdersTopicPolicy: {
            Type: "AWS::SNS::TopicPolicy",
            Properties: {
              Topics: [{ Ref: "OrdersTopic" }],
              PolicyDocument: policyDocument,
            },
          },
        },
      },
    });

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the topic is gone, and so is the subscription that named it.
    assertUndefined(simAws.sns().findTopic("orders"));
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 0);
    assertIdentical(
      stack.getResource("OrdersTopic")?.status,
      "DELETE_COMPLETE",
    );
    assertIdentical(
      stack.getResource("FulfilmentSubscription")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("clears the policy attribute of a topic that outlives the Stack", async () => {
    // Given a topic created outside the Stack, so the policy Resource is the
    // only thing the teardown removes. SNS has no DeleteTopicPolicy: the policy
    // is an attribute, and clearing it is a SetTopicAttributes.
    const simAws = new SimAws();
    const created = await simAws
      .sns()
      .createTopic({ input: { Name: "standing" } });
    assertNonNullable(created.TopicArn);

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "topic-policy-stack",
      template: {
        Resources: {
          StandingTopicPolicy: {
            Type: "AWS::SNS::TopicPolicy",
            Properties: {
              Topics: [created.TopicArn],
              PolicyDocument: policyDocument,
            },
          },
        },
      },
    });

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the topic is still there without a policy on it.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: created.TopicArn }),
      );

    assertNonNullable(read.Attributes);
    assertUndefined(read.Attributes["Policy"]);
  });

  it("unsubscribes a subscription the Stack drops on its own", async () => {
    // Given a topic created outside the Stack with the Stack only holding the
    // subscription to it.
    const simAws = new SimAws();
    const created = await simAws
      .sns()
      .createTopic({ input: { Name: "standing" } });
    assertNonNullable(created.TopicArn);

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "subscription-stack",
      template: {
        Resources: {
          FulfilmentQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "fulfilment" },
          },
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: {
              TopicArn: created.TopicArn,
              Protocol: "sqs",
              Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
            },
          },
        },
      },
    });
    assertArrayLength(simAws.sns().topicSubscriptions("standing"), 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the subscription is gone and the topic is not.
    assertArrayLength(simAws.sns().topicSubscriptions("standing"), 0);
    assertNonNullable(simAws.sns().findTopic("standing"));
  });

  it("reports an AWS::SNS Resource type it cannot delete", async () => {
    // Given a deployed topic and the SNS factory asked to delete it as a
    // Resource type this simulation has no deletion for.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
        },
      },
    });
    const resource = stack.getResource("OrdersTopic");
    assertNonNullable(resource);

    // When the deletion is asked for, then it says so as an unsupported
    // Resource, which is what the teardown records and steps over.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .sns()
        .cfnResourceFactory()
        .delete("PlatformApplication", deployedResourceObject(resource), {
          simAws,
          resources: new Map(),
        }),
    );

    assertIdentical(
      error.message,
      "Unsupported sim SNS CloudFormation Resource PlatformApplication deletion",
    );
  });

  it("reports an AWS::SNS Resource type it does not model", async () => {
    // Given a Stack whose template names an SNS Resource type this simulation
    // has no implementation for.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
          OrdersPlatformApplication: {
            Type: "AWS::SNS::PlatformApplication",
            Properties: { Platform: "APNS" },
          },
        },
      },
    });

    // Then the unsupported Resource is stepped over rather than failing the
    // deployment, and the topic beside it is deployed.
    assertArrayLength(stack.skippedResources, 1);
    assertNonNullable(simAws.sns().findTopic("orders"));

    // And the teardown steps over it the same way.
    await stack.teardown();

    assertUndefined(simAws.sns().findTopic("orders"));
  });
});
