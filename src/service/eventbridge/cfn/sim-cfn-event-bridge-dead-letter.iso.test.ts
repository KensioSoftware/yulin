import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

describe("EventBridge CloudFormation target dead-letter queues", () => {
  /**
   * What a CDK `LambdaFunction` target with `deadLetterQueue` and
   * `retryAttempts` synthesizes, less the permission that would let
   * EventBridge invoke the function.
   */
  const ordersTemplate = {
    Resources: {
      UndeliveredOrders: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "undelivered-orders" },
      },
      UndeliveredOrdersPolicy: {
        Type: "AWS::SQS::QueuePolicy",
        Properties: {
          Queues: [{ Ref: "UndeliveredOrders" }],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "events.amazonaws.com" },
                Action: "sqs:SendMessage",
                Resource: { "Fn::GetAtt": ["UndeliveredOrders", "Arn"] },
                Condition: {
                  ArnEquals: {
                    "aws:SourceArn": { "Fn::GetAtt": ["OrdersRule", "Arn"] },
                  },
                },
              },
            ],
          },
        },
      },
      OrdersRule: {
        Type: "AWS::Events::Rule",
        Properties: {
          Name: "orders",
          EventPattern: { source: ["orders.service"] },
          State: "ENABLED",
          Targets: [
            {
              Id: "fulfilment",
              Arn: "arn:aws:lambda:us-east-1:888888888888:function:fulfilment",
              DeadLetterConfig: {
                Arn: { "Fn::GetAtt": ["UndeliveredOrders", "Arn"] },
              },
              RetryPolicy: {
                MaximumEventAgeInSeconds: 7200,
                MaximumRetryAttempts: 2,
              },
            },
          ],
        },
      },
    },
  };

  it("deploys a rule whose target has a dead-letter queue, and uses it", async () => {
    // Given a function that never granted EventBridge permission to invoke it.
    const simAws = new SimAws();

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "fulfilment",
        Role: "arn:aws:iam::888888888888:role/FulfilmentRole",
        Code: { ZipFile: makeLambdaZipFileInput(() => ({ ok: true })) },
      },
    });

    // When the stack deploys and a matching event is put.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTemplate,
    });

    await stack.waitForDeployComplete();
    await simAws.eventBridge().putEvents(
      new PutEventsCommand({
        Entries: [
          {
            Source: "orders.service",
            DetailType: "OrderPlaced",
            Detail: JSON.stringify({ orderId: "order-1" }),
          },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the refused event is on the stack's dead-letter queue.
    const queue = simAws.sqs().findQueue("undelivered-orders");
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queue?.arn.url }));

    assertArrayLength(received.Messages ?? [], 1);
  });

  it("refuses a target dead-letter queue or retry policy of the wrong shape", async () => {
    // Given targets writing each setting in a shape a template cannot take.
    const targets = [
      { DeadLetterConfig: "undelivered-orders", expected: "DeadLetterConfig" },
      { RetryPolicy: [2], expected: "RetryPolicy is an object" },
      {
        RetryPolicy: { MaximumRetryAttempts: "2" },
        expected: "MaximumRetryAttempts",
      },
    ];

    // When each is deployed.
    for (const { expected, ...setting } of targets) {
      const simAws = new SimAws();

      // oxlint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () => {
        const stack = await simAws.cloudFormation().deployTemplate({
          stackName: "orders-stack",
          template: {
            Resources: {
              OrdersRule: {
                Type: "AWS::Events::Rule",
                Properties: {
                  Name: "orders",
                  EventPattern: { source: ["orders.service"] },
                  Targets: [
                    {
                      Id: "fulfilment",
                      Arn: "arn:aws:sqs:us-east-1:888888888888:orders",
                      ...setting,
                    },
                  ],
                },
              },
            },
          },
        });

        await stack.waitForDeployComplete();
      });

      // Then the deployment fails naming the setting and the Resource.
      assertStringIncludes(error.message, expected);
      assertStringIncludes(error.message, "OrdersRule");
    }
  });
});
