import {
  GetQueueAttributesCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const s3ServicePrincipal = {
  kind: "service",
  service: "s3.amazonaws.com",
} as const;

/**
 * A template deploying a queue and the queue policy admitting S3 to it, which
 * is what CDK synthesises for a Bucket notifying a queue.
 */
function ordersTemplate(
  policyStatement: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      OrdersQueuePolicy: {
        Type: "AWS::SQS::QueuePolicy",
        Properties: {
          Queues: [{ Ref: "OrdersQueue" }],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [policyStatement],
          },
        },
      },
    },
    Outputs: { OrdersQueueUrl: { Value: { Ref: "OrdersQueue" } } },
  };
}

describe("AWS::SQS::QueuePolicy", () => {
  it("deploys the policy it names onto the queue", async () => {
    // Given a template declaring a queue and a policy admitting S3 to it.
    const simAws = new SimAws();
    const queueArn = `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTemplate({
        Effect: "Allow",
        Principal: { Service: "s3.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: queueArn,
      }),
    });
    await stack.waitForDeployComplete();

    // Then the queue carries the policy the template named.
    const queueUrl = stack.outputs.get("OrdersQueueUrl")?.value as string;
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["Policy"],
      }),
    );

    assertNonNullable(read.Attributes?.["Policy"]);
    assertStringIncludes(read.Attributes["Policy"], "s3.amazonaws.com");

    // And the policy takes effect: S3 may send to the queue.
    const sent = await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
        { caller: s3ServicePrincipal },
      );

    assertNonNullable(sent.MessageId);
  });

  it("deploys a policy that admits nobody it does not name", async () => {
    // Given a template whose queue policy admits S3 for another queue.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTemplate({
        Effect: "Allow",
        Principal: { Service: "s3.amazonaws.com" },
        Action: "sqs:SendMessage",
        Resource: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:invoices`,
      }),
    });
    await stack.waitForDeployComplete();

    // Then S3 is refused, rather than the deployed policy admitting anyone who
    // asks.
    const queueUrl = stack.outputs.get("OrdersQueueUrl")?.value as string;
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.sqs().sendMessage(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: "order-1",
        }),
        { caller: s3ServicePrincipal },
      );
    });

    assertIdentical(error.name, "AccessDenied");
  });

  it("fails the Resource when it names no queues", async () => {
    // Given a template whose queue policy names no queue to attach to.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueuePolicy: {
              Type: "AWS::SQS::QueuePolicy",
              Properties: {
                Queues: [],
                PolicyDocument: { Version: "2012-10-17", Statement: [] },
              },
            },
          },
        },
      });
    });

    // Then the Resource failed rather than being quietly treated as deployed.
    assertStringIncludes(error.message, "requires a Queues list of queue URLs");
  });

  it("fails the Resource when a queue is named by something other than a URL", async () => {
    // Given a template whose queue policy names a queue as a number.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueuePolicy: {
              Type: "AWS::SQS::QueuePolicy",
              Properties: {
                Queues: [42],
                PolicyDocument: { Version: "2012-10-17", Statement: [] },
              },
            },
          },
        },
      });
    });

    // Then the Resource failed.
    assertStringIncludes(error.message, "to be a queue URL string");
  });

  it("fails the Resource when it carries no policy document", async () => {
    // Given a template whose queue policy has no PolicyDocument.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: { QueueName: "orders" },
            },
            OrdersQueuePolicy: {
              Type: "AWS::SQS::QueuePolicy",
              Properties: { Queues: [{ Ref: "OrdersQueue" }] },
            },
          },
        },
      });
    });

    // Then the Resource failed rather than attaching an empty policy.
    assertStringIncludes(error.message, "requires a PolicyDocument object");
  });

  it("fails the Resource when the policy document is one SQS would refuse", async () => {
    // Given a template whose queue policy statement names no Action.
    const simAws = new SimAws();

    // When the template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: ordersTemplate({
          Effect: "Allow",
          Principal: { Service: "s3.amazonaws.com" },
          Resource: `arn:aws:sqs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`,
        }),
      });
    });

    // Then the Resource failed, because the policy goes through the same
    // validation an SDK caller's would.
    assertStringIncludes(error.message, "Action or NotAction");
  });
});
