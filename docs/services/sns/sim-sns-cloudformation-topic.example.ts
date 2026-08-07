/**
 * Deploying a topic and a queue subscription from a CloudFormation template.
 */

import { PublishCommand } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "orders", DisplayName: "Orders" },
      },
      FulfilmentQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "fulfilment" },
      },
      // The queue policy is what lets SNS deliver to the queue. It is checked
      // on every message, as it is on real AWS.
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
    Outputs: {
      OrdersTopicArn: { Value: { Ref: "OrdersTopic" } },
      FulfilmentQueueUrl: { Value: { Ref: "FulfilmentQueue" } },
    },
  },
});

// Ref on a topic resolves to its ARN, so it works as a Publish TopicArn.
const topicArn = stack.outputs.get("OrdersTopicArn")?.value as string;

await simAws
  .sns()
  .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));

// Delivery happens after the publish is answered, as it does on real SNS.
await simAws.backgroundTasksComplete();

const QueueUrl = stack.outputs.get("FulfilmentQueueUrl")?.value as string;
const { Messages } = await simAws
  .sqs()
  .receiveMessage(new ReceiveMessageCommand({ QueueUrl }));

console.log(Messages?.[0]?.Body); // "order-1"
