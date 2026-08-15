import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
  UpdateServiceCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import {
  SimEcsClientException,
  SimEcsServiceNotFoundException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";
import { simEcsServiceFactory } from "../../service/sim-ecs-service.factory.js";

describe("ECS UpdateServiceCommand", () => {
  it("scales a service out to the count it was given", async () => {
    // Given a service running one task.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();

    // When it is scaled out to four.
    const updated = await ecs.updateService(
      new UpdateServiceCommand({ service: "checkout", desiredCount: 4 }),
    );
    await simAws.backgroundTasksComplete();

    // Then it keeps four tasks running, the one it already had among them.
    assertIdentical(updated.service?.desiredCount, 4);

    const listed = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(listed.taskArns, 4);

    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(described.services?.[0]?.runningCount, 4);
  });

  it("scales a service in, stopping the tasks it no longer keeps", async () => {
    // Given a service running three tasks.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 3 }, simAws);
    await simAws.backgroundTasksComplete();

    const before = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    // When it is scaled in to one.
    await ecs.updateService(
      new UpdateServiceCommand({ service: "checkout", desiredCount: 1 }),
    );
    await simAws.backgroundTasksComplete();

    // Then one task is left running, and it is the first of the three.
    const after = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(after.taskArns, 1);
    assertIdentical(after.taskArns[0], before.taskArns?.[0]);

    // And the two that were stopped say why.
    const stopped = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [before.taskArns?.[2] ?? ""] }),
    );

    assertIdentical(stopped.tasks?.[0]?.lastStatus, "STOPPED");
    assertIdentical(stopped.tasks[0].stopCode, "UserInitiated");
    assertStringIncludes(stopped.tasks[0].stoppedReason ?? "", "scaling in");
  });

  it("moves a service onto another task definition revision", async () => {
    // Given a service running the first revision of its family.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 2 }, simAws);
    await simAws.backgroundTasksComplete();

    const before = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );
    const second = await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:2" }],
      }),
    );

    // When it is updated onto the second revision.
    const updated = await ecs.updateService(
      new UpdateServiceCommand({
        service: "checkout",
        taskDefinition: "checkout:2",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the service is on the new revision, and its tasks are new ones from
    // it rather than the ones it was running.
    assertIdentical(
      updated.service?.taskDefinition,
      second.taskDefinition?.taskDefinitionArn,
    );

    const after = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(after.taskArns, 2);
    assertFalse(
      after.taskArns.some((arn) => before.taskArns?.includes(arn) === true),
    );

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [after.taskArns[0]] }),
    );

    assertIdentical(
      described.tasks?.[0]?.taskDefinitionArn,
      second.taskDefinition?.taskDefinitionArn,
    );
  });

  it("leaves the tasks alone when the revision is the one it is on", async () => {
    // Given a service running two tasks.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 2 }, simAws);
    await simAws.backgroundTasksComplete();

    const before = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    // When it is updated onto the revision it is already running.
    await ecs.updateService(
      new UpdateServiceCommand({
        service: "checkout",
        taskDefinition: "checkout:1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then nothing is replaced, since there is no rolling deployment here for
    // it to be worth starting again.
    const after = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertIdentical(after.taskArns?.join(","), before.taskArns?.join(","));
  });

  it("refuses an update that changes nothing", async () => {
    // Given a service.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);

    // When it is updated with neither a count nor a task definition.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .updateService(new UpdateServiceCommand({ service: "checkout" })),
    );

    // Then it is refused rather than answered with the service unchanged.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "desiredCount");
  });

  it("refuses a service the cluster does not hold", async () => {
    // Given a cluster with no service in it.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a service of it is updated.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .updateService(
          new UpdateServiceCommand({ service: "checkout", desiredCount: 2 }),
        ),
    );

    // Then it is ECS's own service not found error.
    assertInstanceOf(error, SimEcsServiceNotFoundException);
    assertIdentical(error.name, "ServiceNotFoundException");
  });

  it("refuses a request naming no service", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a service is updated without naming one.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .updateService(
          new UpdateServiceCommand({ service: "", desiredCount: 2 }),
        ),
    );

    // Then it is refused, since there is nothing for the update to be about.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "UpdateService needs the service");
  });
});
