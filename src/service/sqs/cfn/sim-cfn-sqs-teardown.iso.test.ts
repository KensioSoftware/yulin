import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

const policyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "s3.amazonaws.com" },
      Action: "sqs:SendMessage",
      Resource: "*",
    },
  ],
};

describe("SQS CloudFormation Resource teardown", () => {
  it("deletes a queue after the policy declared on it", async () => {
    // Given a deployed queue carrying a queue policy.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
          OrdersQueuePolicy: {
            Type: "AWS::SQS::QueuePolicy",
            Properties: {
              Queues: [{ Ref: "OrdersQueue" }],
              PolicyDocument: policyDocument,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the queue is gone.
    assertUndefined(simAws.sqs().findQueue("orders"));
    assertIdentical(
      stack.getResource("OrdersQueue")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("clears the policy attribute of a queue that outlives the Stack", async () => {
    // Given a queue created outside the Stack, so the policy Resource is the
    // only thing the teardown removes. SQS has no DeleteQueuePolicy: the policy
    // is an attribute, and clearing it is a SetQueueAttributes.
    const simAws = new SimAws();
    const created = await simAws
      .sqs()
      .createQueue({ input: { QueueName: "standing" } });
    assertNonNullable(created.QueueUrl);

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "queue-policy-stack",
      template: {
        Resources: {
          StandingQueuePolicy: {
            Type: "AWS::SQS::QueuePolicy",
            Properties: {
              Queues: [created.QueueUrl],
              PolicyDocument: policyDocument,
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const queue = simAws.sqs().findQueue("standing");
    assertNonNullable(queue);
    assertNonNullable(queue.attributes.queuePolicy);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the queue still exists with no policy on it.
    assertNonNullable(simAws.sqs().findQueue("standing"));
    assertUndefined(queue.attributes.queuePolicy);
  });
});
