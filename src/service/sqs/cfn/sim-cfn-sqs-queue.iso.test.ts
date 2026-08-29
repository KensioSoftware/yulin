import {
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringStartsWith,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSqsQueue } from "../queue/sim-sqs-queue.js";

const accountIdOneOnes = "111111111111";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

describe("SQS CloudFormation Queue deployment", () => {
  it("creates a queue with the attributes the template sets", async () => {
    // Given a template declaring a queue with every attribute it can set.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "orders",
              VisibilityTimeout: 120,
              DelaySeconds: 5,
              MessageRetentionPeriod: 3600,
              MaximumMessageSize: 2048,
              ReceiveMessageWaitTimeSeconds: 10,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the attributes read back as an SDK caller would read them, so a
    // wrong value in the template is a wrong value in the test.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
        AttributeNames: ["All"],
      }),
    );

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["VisibilityTimeout"], "120");
    assertIdentical(read.Attributes["DelaySeconds"], "5");
    assertIdentical(read.Attributes["MessageRetentionPeriod"], "3600");
    assertIdentical(read.Attributes["MaximumMessageSize"], "2048");
    assertIdentical(read.Attributes["ReceiveMessageWaitTimeSeconds"], "10");
    assertIdentical(
      read.Attributes["QueueArn"],
      "arn:aws:sqs:eu-west-2:111111111111:orders",
    );
  });

  it("applies an attribute a template Parameter supplies", async () => {
    // Given a template taking its visibility timeout from a Parameter, which
    // resolves to a string rather than the number a literal property carries.
    const simAws = simAwsInEuWest2();

    // When the template is deployed with a value for it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { QueueVisibilityTimeout: "90" },
      template: {
        Parameters: { QueueVisibilityTimeout: { Type: "Number" } },
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "orders",
              VisibilityTimeout: { Ref: "QueueVisibilityTimeout" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue has the value the Parameter carried.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
        AttributeNames: ["VisibilityTimeout"],
      }),
    );

    assertIdentical(read.Attributes?.["VisibilityTimeout"], "90");
  });

  it("resolves Ref to the queue URL and Fn::GetAtt to its ARN, name and URL", async () => {
    // Given a template referencing its queue every way it can.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
        },
        Outputs: {
          QueueRef: { Value: { Ref: "OrdersQueue" } },
          QueueArn: { Value: { "Fn::GetAtt": ["OrdersQueue", "Arn"] } },
          QueueName: { Value: { "Fn::GetAtt": ["OrdersQueue", "QueueName"] } },
          QueueUrl: { Value: { "Fn::GetAtt": ["OrdersQueue", "QueueUrl"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then Ref is the queue URL, as AWS::SQS::Queue Ref is, so it can be
    // handed straight to SendMessage.
    assertIdentical(
      stack.outputs.get("QueueRef")?.value,
      "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
    );
    assertIdentical(
      stack.outputs.get("QueueArn")?.value,
      "arn:aws:sqs:eu-west-2:111111111111:orders",
    );
    assertIdentical(stack.outputs.get("QueueName")?.value, "orders");
    assertIdentical(
      stack.outputs.get("QueueUrl")?.value,
      "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
    );
  });

  it("sends and receives on the queue a Ref names", async () => {
    // Given a deployed queue whose URL the stack outputs.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
        },
        Outputs: { QueueUrl: { Value: { Ref: "OrdersQueue" } } },
      },
    });
    await stack.waitForDeployComplete();

    const queueUrl = stack.outputs.get("QueueUrl")?.value;
    assertTypeString(queueUrl);

    // When a message is sent to the URL the Ref gave.
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );

    // Then it is receivable from the queue the template created.
    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.at(0)?.Body, "order-1");
  });

  it("names an unnamed queue after the stack and its logical ID", async () => {
    // Given a template leaving QueueName out, as CDK does for a queue with no
    // explicit name.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: { Type: "AWS::SQS::Queue" },
        },
        Outputs: {
          QueueName: { Value: { "Fn::GetAtt": ["OrdersQueue", "QueueName"] } },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue is named from the stack name, the logical ID and a tail
    // derived from both, as real CloudFormation names one.
    const queueName = stack.outputs.get("QueueName")?.value;

    assertStringStartsWith(queueName, "orders-stack-OrdersQueue-");
    assertNonNullable(simAws.sqs().findQueue(queueName));
  });

  it("backs the CloudFormation Resource with the simulated queue", async () => {
    // Given a deployed queue.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Resource is inspected.
    const resource = stack.getResource("OrdersQueue");
    assertNonNullable(resource);

    // Then it is backed by the same simulated queue the service holds, rather
    // than some other simulated resource that happens to have an ARN.
    const queue = resource.simResource;
    assertInstanceOf(queue, SimSqsQueue);
    assertIdentical(simAws.sqs().findQueue("orders"), queue);
  });

  it("creates the queue in the stack's account and region", async () => {
    // Given a simulated AWS whose default scope is not the stack's.
    const simAws = new SimAws();

    // When a template is deployed into another account and region.
    const stack = await simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .cloudFormation()
      .deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: { QueueName: "orders" },
            },
          },
        },
      });
    await stack.waitForDeployComplete();

    // Then the queue exists in that account and region, and nowhere else.
    const scoped = simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .sqs()
      .findQueue("orders");

    assertNonNullable(scoped);
    assertIdentical(
      scoped.arn.value,
      "arn:aws:sqs:us-east-1:111111111111:orders",
    );
    assertUndefined(simAws.sqs().findQueue("orders"));
  });
});
