import { PublishCommand } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const accountIdOneOnes = "111111111111";

const ordersQueueUrl =
  "https://sqs.eu-west-2.amazonaws.com/111111111111/fulfilment";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

/**
 * The Resources a topic delivering to a queue needs: the topic, the queue, and
 * the queue policy admitting SNS. The policy is what authorizes the delivery,
 * and it is the Resource CDK emits alongside an SqsSubscription.
 */
function topicAndQueueResources(): SimCfnTemplateValueRecord {
  return {
    OrdersTopic: {
      Type: "AWS::SNS::Topic",
      Properties: { TopicName: "orders" },
    },
    FulfilmentQueue: {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: "fulfilment" },
    },
    FulfilmentQueuePolicy: {
      Type: "AWS::SQS::QueuePolicy",
      Properties: {
        Queues: [{ Ref: "FulfilmentQueue" }],
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "sns.amazonaws.com" },
              Action: "sqs:SendMessage",
              Resource: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
              Condition: {
                ArnEquals: { "aws:SourceArn": { Ref: "OrdersTopic" } },
              },
            },
          ],
        },
      },
    },
  };
}

/**
 * The message body of the one message on the fulfilment queue.
 */
async function receivedBody(simAws: SimAws): Promise<string> {
  const received = await simAws
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: ordersQueueUrl }));

  const body = received.Messages?.at(0)?.Body;
  assertTypeString(body);

  return body;
}

describe("SNS CloudFormation Subscription deployment", () => {
  it("delivers a publish to the queue an AWS::SNS::Subscription names", async () => {
    // Given a template subscribing a queue to a topic as its own Resource, the
    // way CDK emits a subscription.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...topicAndQueueResources(),
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
        },
      },
    });

    // When a message is published to the topic the template created.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: "arn:aws:sns:eu-west-2:111111111111:orders",
        Message: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the queue received it, wrapped in the SNS envelope.
    const envelope = JSON.parse(await receivedBody(simAws)) as {
      Type: string;
      Message: string;
    };
    assertIdentical(envelope.Type, "Notification");
    assertIdentical(envelope.Message, "order-1");

    // And Ref on the subscription is its ARN, which is the topic's with the
    // subscription id added.
    const subscriptionRef = stack.outputs.get("SubscriptionRef")?.value;
    assertTypeString(subscriptionRef);
    assertNonNullable(simAws.sns().findSubscription(subscriptionRef));
  });

  it("backs the CloudFormation Resource with the simulated subscription", async () => {
    // Given a deployed subscription.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...topicAndQueueResources(),
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: {
              TopicArn: { Ref: "OrdersTopic" },
              Protocol: "sqs",
              Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
            },
          },
        },
      },
    });

    // When the Resource is inspected.
    const resource = stack.getResource("FulfilmentSubscription");
    assertNonNullable(resource);

    // Then it is backed by the same simulated subscription the topic holds,
    // rather than some other simulated resource that happens to have an ARN.
    const subscription = resource.simResource;
    assertNonNullable(subscription);
    assertIdentical(simAws.sns().topicSubscriptions("orders")[0], subscription);
  });

  it("carries RawMessageDelivery through to the delivered message", async () => {
    // Given a subscription asking for raw delivery, which CloudFormation
    // carries as a boolean and SNS holds as a string.
    const simAws = simAwsInEuWest2();
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...topicAndQueueResources(),
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: {
              TopicArn: { Ref: "OrdersTopic" },
              Protocol: "sqs",
              Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
              RawMessageDelivery: true,
            },
          },
        },
      },
    });

    // When a message is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: "arn:aws:sns:eu-west-2:111111111111:orders",
        Message: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the queue received the message on its own rather than the envelope.
    assertIdentical(await receivedBody(simAws), "order-1");
  });

  it("filters deliveries with the FilterPolicy the template writes", async () => {
    // Given a subscription with a filter policy, written as a template object
    // where the API takes a JSON string.
    const simAws = simAwsInEuWest2();
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          ...topicAndQueueResources(),
          FulfilmentSubscription: {
            Type: "AWS::SNS::Subscription",
            Properties: {
              TopicArn: { Ref: "OrdersTopic" },
              Protocol: "sqs",
              Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
              FilterPolicy: { region: ["eu"] },
              FilterPolicyScope: "MessageAttributes",
              RawMessageDelivery: true,
            },
          },
        },
      },
    });

    // When two messages are published, only one of which the policy wants.
    const topicArn = "arn:aws:sns:eu-west-2:111111111111:orders";
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-us",
        MessageAttributes: {
          region: { DataType: "String", StringValue: "us" },
        },
      }),
    );
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: topicArn,
        Message: "order-eu",
        MessageAttributes: {
          region: { DataType: "String", StringValue: "eu" },
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then only the matching one reached the queue.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: ordersQueueUrl,
        MaxNumberOfMessages: 10,
      }),
    );

    assertArrayLength(received.Messages ?? [], 1);
    assertIdentical(received.Messages?.at(0)?.Body, "order-eu");
  });

  it("creates the subscriptions a topic declares inline", async () => {
    // Given a hand-written template using the Subscription property of the
    // topic rather than a Resource of its own.
    const simAws = simAwsInEuWest2();
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          FulfilmentQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "fulfilment" },
          },
          FulfilmentQueuePolicy: {
            Type: "AWS::SQS::QueuePolicy",
            Properties: {
              Queues: [{ Ref: "FulfilmentQueue" }],
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Principal: { Service: "sns.amazonaws.com" },
                    Action: "sqs:SendMessage",
                    Resource: "*",
                  },
                ],
              },
            },
          },
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: {
              TopicName: "orders",
              Subscription: [
                {
                  Protocol: "sqs",
                  Endpoint: { "Fn::GetAtt": ["FulfilmentQueue", "Arn"] },
                },
              ],
            },
          },
        },
      },
    });

    // When a message is published.
    await simAws.sns().publish(
      new PublishCommand({
        TopicArn: "arn:aws:sns:eu-west-2:111111111111:orders",
        Message: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the inline subscription is there and delivered to it.
    assertArrayLength(simAws.sns().topicSubscriptions("orders"), 1);
    const envelope = JSON.parse(await receivedBody(simAws)) as {
      Message: string;
    };
    assertIdentical(envelope.Message, "order-1");
  });
});
