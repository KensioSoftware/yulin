import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnStack } from "../../../cloudformation/stack/sim-cfn-stack.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

const ordersQueueArn = "arn:aws:sqs:us-east-1:888888888888:orders-dlq";
const ordersTopicArn = "arn:aws:sns:us-east-1:888888888888:orders-dead-letters";

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

/**
 * Deploy a failing orders function dead-lettering to whatever the given
 * `DeadLetterConfig` names, beside a queue and a topic it could name.
 */
async function deployOrders(
  simAws: SimAws,
  deadLetterConfig: SimCfnTemplateValue,
): Promise<SimCfnStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersDeadLetterQueue: {
          Type: "AWS::SQS::Queue",
          Properties: { QueueName: "orders-dlq" },
        },
        OrdersDeadLetterTopic: {
          Type: "AWS::SNS::Topic",
          Properties: { TopicName: "orders-dead-letters" },
        },
        OrdersRole: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "OrdersRole",
            AssumeRolePolicyDocument: assumeRolePolicyDocument,
          },
        },
        OrdersFunction: {
          Type: "AWS::Lambda::Function",
          Properties: {
            FunctionName: "orders",
            Role: { "Fn::GetAtt": ["OrdersRole", "Arn"] },
            DeadLetterConfig: deadLetterConfig,
          },
        },
      },
    },
    bindings: [
      {
        logicalId: "OrdersFunction",
        handler: (): never => {
          throw new Error("orders handler failed");
        },
      },
    ],
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * The dead-letter target the deployed function ended up with.
 */
function deadLetterTargetArn(simAws: SimAws): string | undefined {
  const simFunction = simAws.lambda().getSimFunctionByName("orders");
  assertNonNullable(simFunction, "the deployed function");

  return simFunction.deadLetterTargetArn;
}

describe("Lambda CloudFormation Function DeadLetterConfig", () => {
  it("dead-letters to the queue Fn::GetAtt names", async () => {
    // Given a deployed function dead-lettering to a queue in the same
    // template, as CDK's deadLetterQueue synthesizes.
    const simAws = new SimAws();
    await deployOrders(simAws, {
      TargetArn: { "Fn::GetAtt": ["OrdersDeadLetterQueue", "Arn"] },
    });

    assertIdentical(deadLetterTargetArn(simAws), ordersQueueArn);

    // When an asynchronous invocation fails every attempt it is given.
    await simAws.lambda().invoke(
      new InvokeCommand({
        FunctionName: "orders",
        InvocationType: "Event",
        Payload: JSON.stringify({ id: 7 }),
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the event as it was invoked is waiting on the deployed queue.
    const received = await simAws.sqs().receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders-dlq")?.url,
        MaxNumberOfMessages: 10,
      }),
    );

    assertArrayLength(received.Messages ?? [], 1);
    assertIdentical(received.Messages?.[0]?.Body, '{"id":7}');
  });

  it("reads a Ref to a queue as the queue it names", async () => {
    // Given a template naming its dead-letter queue by Ref, which resolves to
    // the queue URL rather than the ARN.
    const simAws = new SimAws();
    await deployOrders(simAws, { TargetArn: { Ref: "OrdersDeadLetterQueue" } });

    // Then the function dead-letters to that same queue.
    assertIdentical(deadLetterTargetArn(simAws), ordersQueueArn);
  });

  it("reads a Ref to a topic as the topic it names", async () => {
    // Given a template dead-lettering to a topic instead.
    const simAws = new SimAws();
    await deployOrders(simAws, { TargetArn: { Ref: "OrdersDeadLetterTopic" } });

    // Then the function dead-letters to the topic.
    assertIdentical(deadLetterTargetArn(simAws), ordersTopicArn);
  });

  it("deploys the function without a target it cannot dead-letter to", async () => {
    // Given a template naming a target real Lambda would refuse.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, {
      TargetArn: "arn:aws:kinesis:us-east-1:888888888888:stream/orders",
    });

    // Then the function is deployed without a dead-letter target, and the
    // omission is recorded rather than taking the function down with it.
    assertUndefined(deadLetterTargetArn(simAws));

    const [ignored, ...rest] = stack.ignoredProperties;

    assertNonNullable(ignored, "a recorded dead-letter target");
    assertArrayLength(rest, 0, "no second record");
    assertIdentical(ignored.logicalId, "OrdersFunction");
    assertIdentical(ignored.path, "DeadLetterConfig.TargetArn");
    assertStringIncludes(ignored.reason, "kinesis");
  });

  it("rejects a DeadLetterConfig that is not an object", async () => {
    // Given a template whose DeadLetterConfig is a bare ARN string.
    const simAws = new SimAws();

    // When the Stack is deployed, then it fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      await deployOrders(simAws, ordersQueueArn);
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::Function OrdersFunction: DeadLetterConfig must " +
        "be an object",
    );
  });

  it("rejects a TargetArn that is not a string", async () => {
    // Given a template whose TargetArn is a number.
    const simAws = new SimAws();

    // When the Stack is deployed, then it fails naming the property.
    const error = await assertThrowsErrorAsync(async () => {
      await deployOrders(simAws, { TargetArn: 7 });
    });

    assertStringIncludes(
      error.message,
      "DeadLetterConfig.TargetArn must be a string",
    );
  });
});
