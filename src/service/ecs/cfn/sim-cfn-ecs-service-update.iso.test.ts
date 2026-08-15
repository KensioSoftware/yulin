import { UpdateStackCommand } from "@aws-sdk/client-cloudformation";
import { ListTasksCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { jsonStringify } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

const imageUri = "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker";

/**
 * The stack a test updates, with the two things an update changes left open.
 */
function ordersTemplate(properties: {
  readonly desiredCount: number;
  readonly imageTag: string;
}): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersCluster: {
        Type: "AWS::ECS::Cluster",
        Properties: { ClusterName: "orders" },
      },
      WorkerTaskDefinition: {
        Type: "AWS::ECS::TaskDefinition",
        Properties: {
          Family: "orders-worker",
          ContainerDefinitions: [
            { Name: "app", Image: `${imageUri}:${properties.imageTag}` },
          ],
        },
      },
      WorkerService: {
        Type: "AWS::ECS::Service",
        Properties: {
          ServiceName: "orders-worker",
          Cluster: { Ref: "OrdersCluster" },
          TaskDefinition: { Ref: "WorkerTaskDefinition" },
          DesiredCount: properties.desiredCount,
        },
      },
    },
  };
}

/**
 * Deploy the stack every test here starts from, keeping one task running.
 */
async function deployedOrdersStack(simAws: SimAws): Promise<void> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: ordersTemplate({ desiredCount: 1, imageTag: "1" }),
  });

  await stack.waitForDeployComplete();
  await simAws.backgroundTasksComplete();
}

/**
 * Apply a changed template to the stack, as an SDK caller updates one.
 */
async function updateOrdersStack(
  simAws: SimAws,
  template: CfnTemplateBodyRecord,
): Promise<void> {
  const cloudFormation = simAws.cloudFormation();

  await cloudFormation.updateStack(
    new UpdateStackCommand({
      StackName: "orders-stack",
      TemplateBody: jsonStringify(template),
    }),
  );
  await cloudFormation.waitForStackUpdateComplete("orders-stack");
  await simAws.backgroundTasksComplete();
}

describe("An AWS::ECS::Service a stack update changes", () => {
  it("keeps the number of tasks the new template asks for", async () => {
    // Given a deployed service keeping one task running.
    const simAws = new SimAws();
    await deployedOrdersStack(simAws);

    // When the stack is updated with a higher desired count.
    await updateOrdersStack(
      simAws,
      ordersTemplate({ desiredCount: 3, imageTag: "1" }),
    );

    // Then the simulated service is keeping that many tasks running.
    const service = simAws.ecs().service("orders-worker", "orders");

    assertIdentical(service.desiredCount, 3);

    const listed = await simAws.ecs().listTasks(
      new ListTasksCommand({
        cluster: "orders",
        serviceName: "orders-worker",
      }),
    );

    assertArrayLength(listed.taskArns, 3);
  });

  it("moves onto the revision the new template registers", async () => {
    // Given a deployed service running revision one of its family.
    const simAws = new SimAws();
    await deployedOrdersStack(simAws);

    assertIdentical(
      simAws.ecs().service("orders-worker", "orders").taskDefinitionArn,
      simAws.ecs().taskDefinition("orders-worker:1").taskDefinitionArn,
    );

    // When the stack is updated with a changed container image, which
    // registers a new revision.
    await updateOrdersStack(
      simAws,
      ordersTemplate({ desiredCount: 1, imageTag: "2" }),
    );

    // Then the service runs the revision the update registered, and the tasks
    // it is keeping are running that one.
    const service = simAws.ecs().service("orders-worker", "orders");
    const secondRevision = simAws
      .ecs()
      .taskDefinition("orders-worker").taskDefinitionArn;

    assertIdentical(simAws.ecs().taskDefinition("orders-worker").revision, 2);
    assertIdentical(service.taskDefinitionArn, secondRevision);

    const listed = await simAws.ecs().listTasks(
      new ListTasksCommand({
        cluster: "orders",
        serviceName: "orders-worker",
        family: "orders-worker",
      }),
    );

    assertArrayLength(listed.taskArns, 1);
    assertIdentical(service.desiredCount, 1);

    // And the revision it was running is the one the update deregistered.
    assertFalse(simAws.ecs().taskDefinition("orders-worker:1").isActive());
  });
});
