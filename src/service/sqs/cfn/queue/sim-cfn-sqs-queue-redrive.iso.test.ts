import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";

const dlqArn = { "Fn::GetAtt": ["OrdersDlq", "Arn"] };

/**
 * A two-queue template, where the main queue redrives to the other one.
 *
 * The dead-letter queue is named through `Fn::GetAtt`, which is how CDK and a
 * hand-written template both name it. That also puts the two queues in the
 * order they have to be created in, since a redrive policy is only accepted
 * once the queue it names exists.
 */
function ordersTemplate(policy: SimCfnTemplateValueRecord): {
  Resources: SimCfnTemplateValueRecord;
  Outputs: SimCfnTemplateValueRecord;
} {
  return {
    Resources: {
      OrdersDlq: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders-dlq" },
      },
      OrdersQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: "orders",
          VisibilityTimeout: 30,
          RedrivePolicy: policy,
        },
      },
    },
    Outputs: {
      QueueUrl: { Value: { Ref: "OrdersQueue" } },
      DlqUrl: { Value: { Ref: "OrdersDlq" } },
    },
  };
}

async function deployOrders(
  simAws: SimAws,
  policy: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: ordersTemplate(policy),
  });
  await stack.waitForDeployComplete();

  return stack;
}

describe("AWS::SQS::Queue RedrivePolicy", () => {
  it("reports back the policy the template declared", async () => {
    // Given a template declaring a queue that redrives to a dead-letter queue
    // the same template creates.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await deployOrders(simAws, {
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 3,
    });

    // Then GetQueueAttributes answers with the policy, carrying the ARN
    // Fn::GetAtt resolved to.
    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: stack.output("QueueUrl"),
        AttributeNames: ["RedrivePolicy"],
      }),
    );

    assertIdentical(
      read.Attributes?.["RedrivePolicy"],
      JSON.stringify({
        deadLetterTargetArn: "arn:aws:sqs:us-east-1:888888888888:orders-dlq",
        maxReceiveCount: 3,
      }),
    );

    // And nothing is recorded against the Resource, since the queue was
    // created with the property rather than around it.
    assertUndefined(
      stack.ignoredProperties.find(
        (ignored) => ignored.path === "RedrivePolicy",
      ),
    );
  });

  it("moves a message past maxReceiveCount to the queue the template named", async () => {
    // Given a deployed queue that gives up on a message after two receives.
    const simAws = new SimAws();
    const stack = await deployOrders(simAws, {
      deadLetterTargetArn: dlqArn,
      maxReceiveCount: 2,
    });
    const sqs = simAws.sqs();
    const QueueUrl = stack.output("QueueUrl");

    await sqs.sendMessage(
      new SendMessageCommand({ QueueUrl, MessageBody: "order-1" }),
    );

    // When a consumer takes the message twice and deletes it neither time.
    async function failToHandleMessage(): Promise<void> {
      await sqs.receiveMessage(new ReceiveMessageCommand({ QueueUrl }));
      await simAws.clock().advanceBy({ seconds: 31 });
    }

    await failToHandleMessage();
    await failToHandleMessage();

    // Then the source queue has given up on it.
    const empty = await sqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl }),
    );
    assertUndefined(empty.Messages);

    // And it is on the dead-letter queue the template named.
    const dead = await sqs.receiveMessage(
      new ReceiveMessageCommand({ QueueUrl: stack.output("DlqUrl") }),
    );
    assertIdentical(dead.Messages?.[0]?.Body, "order-1");
  });

  it("refuses a policy in the words an SDK caller is refused in", async () => {
    // Given a receive count outside the range real SQS accepts.
    const simAws = new SimAws();
    const policy = {
      deadLetterTargetArn: "arn:aws:sqs:us-east-1:888888888888:orders-dlq",
      maxReceiveCount: 0,
    };

    await simAws
      .sqs()
      .createQueue(new CreateQueueCommand({ QueueName: "orders-dlq" }));

    const throughSdk = await assertThrowsErrorAsync(async () => {
      return await simAws.sqs().createQueue(
        new CreateQueueCommand({
          QueueName: "orders-sdk",
          Attributes: { RedrivePolicy: JSON.stringify(policy) },
        }),
      );
    });

    // When a template declaring the same policy is deployed, then the
    // deployment fails with what SQS told the SDK caller.
    const throughTemplate = await assertThrowsErrorAsync(async () => {
      return await deployOrders(new SimAws(), {
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: 0,
      });
    });

    assertStringIncludes(
      throughSdk.message,
      "Value 0 for maxReceiveCount is invalid. It must be an integer from 1 " +
        "to 1000",
    );
    assertStringIncludes(throughTemplate.message, throughSdk.message);
  });

  it("refuses a dead-letter queue that is not there", async () => {
    // Given a policy naming a queue no template created.
    const simAws = new SimAws();

    // When the template is deployed, then it fails where a policy pointing at
    // nothing would otherwise have looked like a working dead-letter queue.
    const error = await assertThrowsErrorAsync(async () => {
      return await deployOrders(simAws, {
        deadLetterTargetArn: "arn:aws:sqs:us-east-1:888888888888:missing",
        maxReceiveCount: 3,
      });
    });

    assertStringIncludes(
      error.message,
      "Dead letter target arn:aws:sqs:us-east-1:888888888888:missing does " +
        "not exist",
    );
    assertUndefined(simAws.sqs().findQueue("orders"));
  });

  it("refuses a policy that is neither an object nor a string", async () => {
    // Given a RedrivePolicy carrying something no document could be read out
    // of, which real CloudFormation refuses against its own schema.
    const simAws = new SimAws();

    // When the template is deployed, then it is refused rather than handed to
    // SQS as the text of a number.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: { QueueName: "orders", RedrivePolicy: 3 },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "Invalid AWS::SQS::Queue Resource OrdersQueue: RedrivePolicy must be a " +
        "JSON document",
    );
  });

  it("takes a policy a template Parameter carries as a string", async () => {
    // Given a template taking the whole policy from a Parameter, which
    // resolves to the JSON string SQS carries the attribute as.
    const simAws = new SimAws();
    const policy = JSON.stringify({
      deadLetterTargetArn: "arn:aws:sqs:us-east-1:888888888888:orders-dlq",
      maxReceiveCount: 5,
    });

    // When the template is deployed with a value for it.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { Redrive: policy },
      template: {
        Parameters: { Redrive: { Type: "String" } },
        Resources: {
          OrdersDlq: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders-dlq" },
          },
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            DependsOn: "OrdersDlq",
            Properties: {
              QueueName: "orders",
              RedrivePolicy: { Ref: "Redrive" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue reports the string the Parameter carried.
    const queue = simAws.sqs().findQueue("orders");
    assertNonNullable(queue);

    const read = await simAws.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queue.url,
        AttributeNames: ["RedrivePolicy"],
      }),
    );

    assertIdentical(read.Attributes?.["RedrivePolicy"], policy);
  });
});
