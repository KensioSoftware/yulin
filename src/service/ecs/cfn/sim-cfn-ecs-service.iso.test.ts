import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValue } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const imageUri = "example.dkr.ecr.eu-west-2.amazonaws.com/orders-worker:1";

/**
 * The cluster and task definition a service needs before it is anything.
 */
const workerResources: Record<string, SimCfnTemplateValue> = {
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
};

const serviceTemplate: CfnTemplateBodyRecord = {
  Resources: {
    ...workerResources,
    WorkerService: {
      Type: "AWS::ECS::Service",
      Properties: {
        ServiceName: "orders-worker",
        Cluster: { Ref: "OrdersCluster" },
        TaskDefinition: { Ref: "WorkerTaskDefinition" },
        DesiredCount: 2,
        LaunchType: "FARGATE",
      },
    },
  },
  Outputs: {
    ServiceRef: { Value: { Ref: "WorkerService" } },
    ServiceName: { Value: { "Fn::GetAtt": ["WorkerService", "Name"] } },
    ServiceArn: { Value: { "Fn::GetAtt": ["WorkerService", "ServiceArn"] } },
  },
};

describe("AWS::ECS::Service", () => {
  it("creates a simulated service the template declares", async () => {
    // Given a template declaring a cluster, a task definition and a service of
    // two tasks.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate,
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the cluster holds the service, running the revision the stack
    // registered, and the Resource answers Ref and Fn::GetAtt ServiceArn with
    // the service ARN and Fn::GetAtt Name with the service name.
    const service = simAws.ecs().service("orders-worker", "orders");

    assertTrue(service.isActive());
    assertIdentical(service.desiredCount, 2);
    assertIdentical(
      service.taskDefinitionArn,
      simAws.ecs().taskDefinition("orders-worker").taskDefinitionArn,
    );
    assertIdentical(stack.outputs.get("ServiceRef")?.value, service.serviceArn);
    assertIdentical(stack.outputs.get("ServiceArn")?.value, service.serviceArn);
    assertIdentical(stack.outputs.get("ServiceName")?.value, "orders-worker");

    // And it is keeping the number of tasks it declared running.
    const listed = await simAws.ecs().listTasks(
      new ListTasksCommand({
        cluster: "orders",
        serviceName: "orders-worker",
      }),
    );

    assertArrayLength(listed.taskArns, 2);
  });

  it("runs a task definition the template names by ARN", async () => {
    // Given a revision registered by another stack, named by its ARN rather
    // than by a Ref to a Resource of the same stack.
    const simAws = new SimAws();
    const registered = await simAws.cloudFormation().deployTemplate({
      stackName: "worker-stack",
      template: { Resources: workerResources },
    });

    await registered.waitForDeployComplete();

    const taskDefinitionArn = simAws
      .ecs()
      .taskDefinition("orders-worker").taskDefinitionArn;

    // When a service naming that ARN is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          WorkerService: {
            Type: "AWS::ECS::Service",
            Properties: {
              ServiceName: "orders-worker",
              Cluster: "orders",
              TaskDefinition: taskDefinitionArn,
              DesiredCount: 1,
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the service runs that revision.
    assertIdentical(
      simAws.ecs().service("orders-worker", "orders").taskDefinitionArn,
      taskDefinitionArn,
    );
  });

  it("runs the container a deploy-time binding names", async () => {
    // Given a template whose service runs a task definition with one
    // container.
    const simAws = new SimAws();

    // When it is deployed with a binding for that container.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate,
      bindings: [
        {
          logicalId: "WorkerTaskDefinition",
          run: (): void => {
            // A service container is available to be called rather than run
            // once, so nothing calls this until something reaches it.
          },
        },
      ],
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the bound container of each of the service's tasks is running.
    const described = await simAws.ecs().describeServices(
      new DescribeServicesCommand({
        cluster: "orders",
        services: ["orders-worker"],
      }),
    );

    assertIdentical(described.services?.[0]?.runningCount, 2);

    const listed = await simAws.ecs().listTasks(
      new ListTasksCommand({
        cluster: "orders",
        serviceName: "orders-worker",
      }),
    );
    const describedTasks = await simAws.ecs().describeTasks(
      new DescribeTasksCommand({
        cluster: "orders",
        tasks: [...(listed.taskArns ?? [])],
      }),
    );

    assertArrayLength(describedTasks.tasks, 2);
    assertIdentical(
      describedTasks.tasks[0].containers?.[0]?.lastStatus,
      "RUNNING",
    );
  });

  it("deletes the service when the stack is torn down", async () => {
    // Given a deployed service keeping two tasks running.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: serviceTemplate,
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When the stack is deleted.
    await stack.delete();
    await simAws.backgroundTasksComplete();

    // Then the service is INACTIVE rather than gone, and it is keeping
    // nothing running: it was deleted while it was still scaled up, rather
    // than having to be scaled to zero first.
    const service = simAws.ecs().service("orders-worker", "orders");

    assertFalse(service.isActive());
    assertIdentical(service.desiredCount, 0);
    assertIdentical(service.tasks.count, 0);
  });
});
