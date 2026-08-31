import {
  CreateServiceCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertSetSize,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { createFixtureIpTargetGroup } from "../../../elbv2/sim-elbv2.fixture.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("ECS CreateServiceCommand", () => {
  it("keeps the number of tasks the service asked for", async () => {
    // Given a task definition whose container is bound to a handler.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        // A service container is available to be called rather than run once.
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a service is created with a desired count of three.
    const created = await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 3,
      }),
    );

    // Then it is answered before its tasks have started, as real ECS answers
    // one.
    assertIdentical(created.service?.status, "ACTIVE");
    assertIdentical(created.service.desiredCount, 3);
    assertIdentical(created.service.runningCount, 0);
    assertIdentical(created.service.pendingCount, 3);
    assertIdentical(created.service.schedulingStrategy, "REPLICA");

    // And once the simulation's background work is done, three tasks of it are
    // running.
    await simAws.backgroundTasksComplete();

    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(listed.taskArns, 3);
    assertSetSize(new Set(listed.taskArns), 3);

    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(described.services?.[0]?.runningCount, 3);
    assertIdentical(described.services[0].pendingCount, 0);
    assertIdentical(described.services[0].desiredCount, 3);
  });

  it("describes each of the tasks it is keeping running", async () => {
    // Given a service created from a bound task definition.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        // Nothing is called while the service is only being kept running.
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 2,
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the tasks the service keeps are described.
    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [...(listed.taskArns ?? [])] }),
    );

    // Then each of them is running, with its bound container running and
    // carrying no exit code, because nothing has ended.
    assertArrayLength(described.tasks, 2);
    assertIdentical(described.tasks[0].lastStatus, "RUNNING");
    assertIdentical(described.tasks[0].desiredStatus, "RUNNING");
    assertIdentical(described.tasks[0].group, "service:checkout");
    assertIdentical(described.tasks[0].startedBy, "ecs-svc/checkout");
    assertIdentical(described.tasks[0].containers?.[0]?.lastStatus, "RUNNING");
    assertUndefined(described.tasks[0].containers[0].exitCode);
  });

  it("creates a service whose containers are all unbound", async () => {
    // Given a task definition with no binding at all.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          { name: "app", image: "checkout:1" },
          { name: "log-router", image: "aws-for-fluent-bit:latest" },
        ],
      }),
    );

    // When a service is created from it.
    await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 2,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the service reports its counts all the same, and its containers
    // record that nothing here simulates them.
    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(described.services?.[0]?.runningCount, 2);

    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );
    const tasks = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [...(listed.taskArns ?? [])] }),
    );
    const containers = tasks.tasks?.[0]?.containers ?? [];

    assertArrayLength(containers, 2);
    assertIdentical(containers[0].lastStatus, "STOPPED");
    assertStringIncludes(containers[0].reason ?? "", "Not simulated");
    assertStringIncludes(containers[1].reason ?? "", "Not simulated");
    assertIdentical(tasks.tasks?.[0]?.lastStatus, "RUNNING");
  });

  it("creates a service that is keeping nothing running", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a service is created with a desired count of zero.
    const created = await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 0,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then it exists and runs nothing, which is what scaling one to nothing
    // leaves behind.
    assertIdentical(created.service?.desiredCount, 0);

    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayEmpty(listed.taskArns);
  });

  it("reports the launch type the service was created with", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a service is created on Fargate.
    const created = await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 1,
        launchType: "FARGATE",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the service reports it, and so do the tasks it is keeping.
    assertIdentical(created.service?.launchType, "FARGATE");

    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout", launchType: "FARGATE" }),
    );

    assertArrayLength(listed.taskArns, 1);
  });

  it("registers the service's tasks with the load balancer it was created with", async () => {
    // Given a registered task definition and a target group of addresses.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    const targetGroupArn = await createFixtureIpTargetGroup(simAws.elbV2());

    // When a service is created behind that target group.
    const created = await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 2,
        loadBalancers: [
          { targetGroupArn, containerName: "app", containerPort: 8080 },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the declaration is reported back and held on the service.
    assertIdentical(
      created.service?.loadBalancers?.[0]?.targetGroupArn,
      targetGroupArn,
    );
    assertIdentical(
      ecs.service("checkout").loadBalancers[0]?.containerPort,
      8080,
    );

    // And each task the service keeps running is a target of the group, on
    // the port the registration named.
    const health = await simAws
      .elbV2()
      .describeTargetHealth({ input: { TargetGroupArn: targetGroupArn } });

    assertArrayLength(health.TargetHealthDescriptions, 2);
    assertIdentical(health.TargetHealthDescriptions[0].Target.Port, 8080);
    assertIdentical(
      health.TargetHealthDescriptions[0].TargetHealth.State,
      "healthy",
    );
  });

  it("names the service by the cluster it was created in", async () => {
    // Given a registered task definition and two clusters.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsClusterFactory.make({ clusterName: "services" }, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a service is created in that cluster.
    const created = await ecs.createService(
      new CreateServiceCommand({
        cluster: "services",
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 1,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then its ARN names the cluster, as a real service ARN does, and a
    // describe against another cluster reports nothing.
    assertStringIncludes(
      created.service?.serviceArn ?? "",
      ":service/services/checkout",
    );

    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertArrayEmpty(described.services);
    assertArrayLength(described.failures, 1);
  });
});
