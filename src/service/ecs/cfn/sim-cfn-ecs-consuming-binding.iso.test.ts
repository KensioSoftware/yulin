import {
  CreateServiceCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { makeConsumedQueue } from "../../../../test/ecs/consuming-service-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

const imageUri =
  "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:build-7";

const workerTemplate: CfnTemplateBodyRecord = {
  Resources: {
    OrdersCluster: {
      Type: "AWS::ECS::Cluster",
      Properties: { ClusterName: "orders" },
    },
    WorkerTaskDefinition: {
      Type: "AWS::ECS::TaskDefinition",
      Properties: {
        Family: "orders-worker",
        ContainerDefinitions: [{ Name: "app", Image: imageUri }],
      },
    },
  },
};

describe("An ECS CloudFormation binding that consumes a queue", () => {
  it("consumes the queue once a service runs the deployed container", async () => {
    // Given a queue and a task Role that may consume it.
    const simAws = new SimAws();
    const { queueUrl, queueArn } = await makeConsumedQueue(simAws);
    const taskRole = await makeConsumingRole(simAws, queueArn);
    const handled: string[] = [];

    // And a Stack whose task definition container is bound to consume it at
    // deploy time, which is where a template gives a test its only handle on
    // the container.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: workerTemplate,
      bindings: [
        {
          logicalId: "WorkerTaskDefinition",
          consumes: {
            queueUrl,
            handler: (messages) => {
              handled.push(...messages.map((message) => message.Body));
            },
          },
        },
      ],
    });

    await stack.waitForDeployComplete();

    // When a service runs the deployed revision and a message is sent.
    await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        taskRoleArn: taskRole,
        containerDefinitions: [{ name: "app", image: imageUri }],
      }),
    );
    await simAws.ecs().createService(
      new CreateServiceCommand({
        cluster: "orders",
        serviceName: "orders-worker",
        taskDefinition: "orders-worker",
        desiredCount: 1,
      }),
    );
    await simAws
      .sqs()
      .sendMessage(
        new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: "order-1" }),
      );
    await simAws.backgroundTasksComplete();

    // Then the deploy-time binding is the one polling, so a container a
    // template declared consumes its queue without the test naming a family.
    assertArrayLength(handled, 1);
    assertIdentical(handled[0], "order-1");
  });
});

/**
 * Make a task Role allowed to consume one queue.
 */
async function makeConsumingRole(
  simAws: SimAws,
  queueArn: string,
): Promise<string> {
  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrdersWorkerTaskRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrdersWorkerTaskRole",
      PolicyName: "ConsumeOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: [
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
          ],
          Resource: queueArn,
        },
      }),
    }),
  );

  return `arn:aws:iam::${simAws.defaultAccountId}:role/OrdersWorkerTaskRole`;
}
