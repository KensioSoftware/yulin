import {
  GetQueueAttributesCommand,
  ListQueuesCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertStringEndsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("SQS CloudFormation FIFO queues", () => {
  it("deploys a named FIFO queue with its deduplication settings", async () => {
    // Given a template declaring a FIFO queue by name.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "orders.fifo",
              FifoQueue: true,
              ContentBasedDeduplication: true,
              DeduplicationScope: "messageGroup",
              FifoThroughputLimit: "perMessageGroupId",
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue is a FIFO queue holding those settings.
    const queue = simAws.sqs().findQueue("orders.fifo");

    assertNonNullable(queue);

    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queue.url,
        AttributeNames: ["All"],
      }),
    );

    const attributes = read.Attributes;

    assertNonNullable(attributes);
    assertIdentical(attributes["FifoQueue"], "true");
    assertIdentical(attributes["ContentBasedDeduplication"], "true");
    assertIdentical(attributes["DeduplicationScope"], "messageGroup");
  });

  it("names an unnamed FIFO queue with the .fifo suffix", async () => {
    // Given a template declaring a FIFO queue without a name.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { FifoQueue: "true" },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the generated name ends .fifo, as real CloudFormation's does.
    const listed = await simAws.sqs().listQueues(new ListQueuesCommand({}));
    const url = listed.QueueUrls?.[0] ?? "";

    assertStringIncludes(url, "/orders-stack-OrdersQueue-");
    assertStringEndsWith(url, ".fifo");
  });

  it("fails a standard queue declaring content-based deduplication", async () => {
    // Given a template declaring a FIFO setting on a standard queue.
    const simAws = new SimAws();

    // When it is deployed, then it fails, as SQS refuses the attribute.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: {
                QueueName: "orders",
                ContentBasedDeduplication: true,
              },
            },
          },
        },
      });
    });

    assertStringIncludes(error.message, "ContentBasedDeduplication");
    assertUndefined(simAws.sqs().findQueue("orders"));
  });

  it("fails a FIFO property that is neither a boolean nor a word", async () => {
    // Given a template carrying a number as a FIFO queue's deduplication scope.
    const simAws = new SimAws();

    // When it is deployed, then the Resource fails for the property's type.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: {
                QueueName: "orders.fifo",
                FifoQueue: true,
                DeduplicationScope: 1,
              },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "DeduplicationScope must be a boolean or a string",
    );
  });
});
