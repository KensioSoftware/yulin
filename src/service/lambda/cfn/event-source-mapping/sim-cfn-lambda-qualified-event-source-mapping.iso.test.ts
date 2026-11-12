import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringEndsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaSqsEvent } from "../../event-source/poll/sim-lambda-sqs-event.js";

/**
 * A queue, a consumer function with a published version and a `live` alias on
 * it, and a mapping whose FunctionName is the given value, as CDK's
 * `alias.addEventSource(new SqsEventSource(queue))` synthesises one.
 */
function aliasConsumerTemplate(
  functionName: SimCfnTemplateValue,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrderQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      ConsumerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "ConsumeOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "sqs:ReceiveMessage",
                      "sqs:DeleteMessage",
                      "sqs:GetQueueAttributes",
                    ],
                    Resource: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
                  },
                ],
              },
            },
          ],
        },
      },
      ConsumerFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "order-consumer",
          Role: { "Fn::GetAtt": ["ConsumerRole", "Arn"] },
        },
      },
      ConsumerVersion: {
        Type: "AWS::Lambda::Version",
        Properties: { FunctionName: { Ref: "ConsumerFunction" } },
      },
      LiveAlias: {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: "ConsumerFunction" },
          Name: "live",
          FunctionVersion: { "Fn::GetAtt": ["ConsumerVersion", "Version"] },
        },
      },
      OrderConsumerMapping: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: {
          EventSourceArn: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
          FunctionName: functionName,
        },
      },
    },
  };
}

describe("Lambda CloudFormation event source mapping onto an alias", () => {
  it("delivers to the alias a mapping's FunctionName names", async () => {
    // Given a template mapping a queue onto the function's live alias, by the
    // alias ARN a Ref on the alias resolves to.
    const simAws = new SimAws();
    const versions: string[] = [];
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: aliasConsumerTemplate({ Ref: "LiveAlias" }),
      bindings: [
        {
          logicalId: "ConsumerFunction",
          handler: (
            event: SimLambdaSqsEvent,
            context: { functionVersion: string },
          ): undefined => {
            versions.push(
              `${context.functionVersion}:${String(event.Records.length)}`,
            );

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // When a message is sent to the queue.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders")?.url,
        MessageBody: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the mapping keeps the qualifier, and the alias's version handles it.
    const mapping = stack.getResource("OrderConsumerMapping")?.simResource;
    assertInstanceOf(mapping, SimLambdaEventSourceMapping);
    assertIdentical(mapping.qualifier, "live");
    assertStringEndsWith(mapping.functionArn, ":function:order-consumer:live");
    assertArrayEquals(versions, ["1:1"]);
  });
});
