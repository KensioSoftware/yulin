import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimLambdaEventSourceMapping } from "../event-source/sim-lambda-event-source-mapping.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const consumerRole = {
  Type: "AWS::IAM::Role",
  Properties: {
    RoleName: "consumer-role",
    AssumeRolePolicyDocument: assumeRolePolicyDocument,
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
};

const consumerFunction = {
  Type: "AWS::Lambda::Function",
  Properties: {
    FunctionName: "order-consumer",
    Role: { "Fn::GetAtt": ["ConsumerRole", "Arn"] },
    Code: { ZipFile: "exports.handler = async () => 'consumed';" },
    Handler: "index.handler",
    Runtime: "nodejs22.x",
  },
};

describe("Lambda CloudFormation Resource teardown", () => {
  it("deletes a Function URL before the function it is on", async () => {
    // Given a deployed function with a Function URL on it. The URL is state on
    // the function rather than a resource of its own, so its Resource has to
    // be taken off before the function it names goes.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "greeter-stack",
      template: {
        Resources: {
          ConsumerRole: {
            Type: "AWS::IAM::Role",
            Properties: {
              RoleName: "greeter-role",
              AssumeRolePolicyDocument: assumeRolePolicyDocument,
            },
          },
          GreeterFunction: {
            ...consumerFunction,
            Properties: {
              ...consumerFunction.Properties,
              FunctionName: "greeter",
            },
          },
          GreeterUrl: {
            Type: "AWS::Lambda::Url",
            Properties: {
              TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
              AuthType: "NONE",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    assertNonNullable(simAws.lambda().getSimFunctionUrl("greeter"));

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the URL configuration is gone, and the function it was on has
    // followed it out with the rest of the Stack.
    assertUndefined(simAws.lambda().getSimFunctionUrl("greeter"));
    assertUndefined(simAws.lambda().getSimFunctionByName("greeter"));
  });

  it("deletes an event source mapping before its queue and function", async () => {
    // Given a deployed queue, a consumer function, and a mapping between them,
    // as CDK's fn.addEventSource(new SqsEventSource(queue)) synthesises.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "consumer-stack",
      template: {
        Resources: {
          OrderQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
          ConsumerRole: consumerRole,
          ConsumerFunction: consumerFunction,
          OrderConsumerMapping: {
            Type: "AWS::Lambda::EventSourceMapping",
            Properties: {
              EventSourceArn: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
              FunctionName: { Ref: "ConsumerFunction" },
              BatchSize: 5,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const mapping = stack.getResource("OrderConsumerMapping")?.simResource as
      | SimLambdaEventSourceMapping
      | undefined;
    assertNonNullable(mapping);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the mapping, the queue and the function have all gone.
    assertUndefined(simAws.lambda().getSimEventSourceMapping(mapping.uuid));
    assertUndefined(simAws.sqs().findQueue("orders"));
    assertUndefined(simAws.lambda().getSimFunctionByName("order-consumer"));
    assertArrayLength(stack.skippedResourceDeletions, 0);
    assertIdentical(
      stack.getResource("OrderConsumerMapping")?.status,
      "DELETE_COMPLETE",
    );
  });
});
