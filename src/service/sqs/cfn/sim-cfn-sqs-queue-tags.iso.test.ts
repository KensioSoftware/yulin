import { ListQueueTagsCommand } from "@aws-sdk/client-sqs";
import { assertArrayEmpty, assertObjectEquals } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("SQS CloudFormation Queue tags", () => {
  it("creates a queue with the tags the template declares", async () => {
    // Given a template declaring a queue with the tag list CDK writes
    const simAws = new SimAws({
      defaultAccountId: "111111111111",
      defaultRegionName: "eu-west-2",
    });

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: {
              QueueName: "orders",
              Tags: [
                { Key: "team", Value: "orders" },
                { Key: "stage", Value: "test" },
              ],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue holds them, and nothing is recorded as skipped
    const listed = await simAws.sqs().listQueueTags(
      new ListQueueTagsCommand({
        QueueUrl: "https://sqs.eu-west-2.amazonaws.com/111111111111/orders",
      }),
    );
    assertObjectEquals(listed.Tags, { team: "orders", stage: "test" });
    assertArrayEmpty(stack.getResource("OrdersQueue")?.ignoredProperties ?? []);
  });
});
