import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimSqsCfnResourceFactory } from "./sim-sqs-cfn-resource-factory.js";

const accountIdOneOnes = "111111111111" as SimAwsAccountId;

function queueResource(properties: SimCfnTemplateValueRecord): SimCfnResource {
  return new SimCfnResource({
    accountRegionScope: {
      accountId: accountIdOneOnes,
      regionName: "eu-west-2",
    },
    logicalId: "BadQueue",
    template: { Type: "AWS::SQS::Queue", Properties: properties },
  });
}

/**
 * Create a queue straight through the Resource factory, returning whatever it
 * rejects with. Keeps the property rules under test without a whole stack.
 */
async function createQueueResource(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const factory = new SimSqsCfnResourceFactory({ sqs: simAws.sqs() });

  return await assertThrowsErrorAsync(async () => {
    return await factory.create("Queue", queueResource(properties), {
      simAws,
      resources: new Map(),
    });
  });
}

describe("SQS CloudFormation Queue validation", () => {
  it("fails a FIFO queue rather than creating a standard one", async () => {
    // Given a template asking for a FIFO queue, which is not simulated.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      return await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersQueue: {
              Type: "AWS::SQS::Queue",
              Properties: { QueueName: "orders.fifo", FifoQueue: true },
            },
          },
        },
      });
    });

    // And the failure names FIFO, rather than the Resource being skipped or
    // quietly deployed as a standard queue.
    assertStringIncludes(
      error.message,
      "FifoQueue names a FIFO queue, which simulated SQS does not simulate",
    );

    const stack = simAws.cloudFormation().getStackByName("orders-stack");
    assertNonNullable(stack);
    assertIdentical(stack.getResource("OrdersQueue")?.status, "CREATE_FAILED");
    assertUndefined(simAws.sqs().findQueue("orders.fifo"));
  });

  it("creates a standard queue for FifoQueue false", async () => {
    // Given a template setting FifoQueue false, which is a standard queue.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders", FifoQueue: false },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the queue is created, since nothing about it is FIFO.
    assertNonNullable(simAws.sqs().findQueue("orders"));
  });

  it("refuses a FifoQueue value that is neither true nor false", async () => {
    // Given a template carrying something else as FifoQueue, which real
    // CloudFormation refuses as well.
    // When the Resource is created, then it is refused rather than read as
    // false, since the queue it asked for is not knowable.
    const error = await createQueueResource({
      QueueName: "orders",
      FifoQueue: "yes",
    });

    assertIdentical(
      error.message,
      "Invalid AWS::SQS::Queue Resource BadQueue: FifoQueue must be true or " +
        "false",
    );
  });

  it("refuses the properties this simulation does not model", async () => {
    // Given templates declaring properties with behaviour that is not
    // simulated.
    // When each Resource is created, then each is refused by name rather than
    // deploying a queue that behaves differently here than on AWS.
    const redrive = await createQueueResource({
      QueueName: "orders",
      RedrivePolicy: { maxReceiveCount: 3 },
    });
    assertIdentical(
      redrive.message,
      "Invalid AWS::SQS::Queue Resource BadQueue: RedrivePolicy is a real " +
        "AWS::SQS::Queue property that simulated SQS does not simulate, so " +
        "it is refused rather than ignored",
    );

    const encryption = await createQueueResource({
      QueueName: "orders",
      KmsMasterKeyId: "alias/aws/sqs",
    });
    assertStringIncludes(
      encryption.message,
      "KmsMasterKeyId is a real AWS::SQS::Queue property",
    );

    const tags = await createQueueResource({
      QueueName: "orders",
      Tags: [{ Key: "component", Value: "orders" }],
    });
    assertStringIncludes(
      tags.message,
      "Tags is a real AWS::SQS::Queue property",
    );
  });

  it("refuses a property AWS::SQS::Queue does not have", async () => {
    // Given a template naming a property that is not on this Resource type.
    // When the Resource is created, then it is refused rather than ignored, so
    // a misspelled property does not pass here and fail the deployment.
    const error = await createQueueResource({
      QueueName: "orders",
      VisibilityTimeoutSeconds: 30,
    });

    assertIdentical(
      error.message,
      "Invalid AWS::SQS::Queue Resource BadQueue: VisibilityTimeoutSeconds " +
        "is not an AWS::SQS::Queue property",
    );
  });

  it("refuses malformed property values", async () => {
    // Given properties of the wrong shape.
    // When each Resource is created, then each is refused by name.
    const name = await createQueueResource({ QueueName: 42 });
    assertIdentical(
      name.message,
      "Invalid AWS::SQS::Queue Resource BadQueue: QueueName must be a string",
    );

    const timeout = await createQueueResource({
      QueueName: "orders",
      VisibilityTimeout: true,
    });
    assertIdentical(
      timeout.message,
      "Invalid AWS::SQS::Queue Resource BadQueue: VisibilityTimeout must be " +
        "a number",
    );
  });

  it("passes the attribute ranges SQS applies through to CreateQueue", async () => {
    // Given a template setting an attribute outside the range real SQS
    // accepts for it.
    // When the Resource is created, then CreateQueue refuses it, so the
    // refusal reads the same whether a template or an SDK caller asked.
    const error = await createQueueResource({
      QueueName: "orders",
      VisibilityTimeout: 50_000,
    });

    assertStringIncludes(
      error.message,
      "Value 50000 for parameter VisibilityTimeout is invalid",
    );
  });

  it("refuses a queue name another stack already used", async () => {
    // Given a queue a stack already deployed. Sim CloudFormation has no
    // UpdateStack, so every deployment is a create.
    const simAws = new SimAws();
    const factory = new SimSqsCfnResourceFactory({ sqs: simAws.sqs() });
    await factory.create(
      "Queue",
      queueResource({ QueueName: "orders", VisibilityTimeout: 60 }),
      { simAws, resources: new Map() },
    );

    // When a second stack claims the same name with different attributes, then
    // it is refused, as real SQS refuses it.
    const error = await assertThrowsErrorAsync(async () => {
      return await factory.create(
        "Queue",
        queueResource({ QueueName: "orders", VisibilityTimeout: 120 }),
        { simAws, resources: new Map() },
      );
    });

    assertStringIncludes(
      error.message,
      "A queue already exists with the name orders and different attributes",
    );
  });

  it("refuses an attribute AWS::SQS::Queue does not have", async () => {
    // Given a deployed queue.
    const simAws = new SimAws();
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

    const resource = stack.getResource("OrdersQueue");
    assertNonNullable(resource);

    // When an attribute the Resource type does not have is read, then it is
    // refused rather than resolving to nothing.
    const error = assertThrowsError(() => {
      resource.attributeValue("QueueArn");
    });
    assertIdentical(
      error.message,
      "Unsupported AWS::SQS::Queue attribute QueueArn",
    );
  });

  it("records an SQS Resource type it cannot create as skipped", async () => {
    // Given a template declaring an SQS Resource type this simulation has no
    // behaviour for.
    const simAws = new SimAws();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersQueue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: "orders" },
          },
          OrdersQueueInboundPermission: {
            Type: "AWS::SQS::QueueInboundPermission",
            Properties: { QueueUrl: { Ref: "OrdersQueue" } },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the stack completes with that Resource skipped rather than failing
    // the deployment.
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertTrue(skipped.skipped);
    assertIdentical(
      skipped.skippedReason,
      "Unsupported sim SQS CloudFormation Resource QueueInboundPermission",
    );
  });
});
