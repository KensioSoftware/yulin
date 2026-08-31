import {
  DeleteServiceCommand,
  DescribeTasksCommand,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { BackgroundTasks } from "../../../util/background/background.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../cluster/sim-ecs-cluster.factory.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../task-definition/sim-ecs-registered-task-definition.factory.js";
import { simEcsServiceFactory } from "./sim-ecs-service.factory.js";

describe("What a simulated ECS service leaves running", () => {
  it("leaves nothing scheduled once its tasks are up", async () => {
    // Given a simulated environment whose background work can be counted.
    const background = new BackgroundTasks();
    const simAws = new SimAws({ background });
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a service is created and its tasks come up.
    await simEcsServiceFactory.make({ desiredCount: 3 }, simAws);
    await simAws.backgroundTasksComplete();

    // Then nothing is left scheduled, so discarding the environment leaves
    // nothing behind: a service is kept as state rather than by a timer.
    assertIdentical(background.pendingTaskCount, 0);
    assertIdentical(background.dueTaskCount, 0);
  });

  it("stops the tasks of every service when the environment closes", async () => {
    // Given a service running two tasks.
    const background = new BackgroundTasks();
    const simAws = new SimAws({ background });
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 2 }, simAws);
    await simAws.backgroundTasksComplete();

    const before = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayLength(before.taskArns, 2);

    // When the environment is closed.
    await simAws.close();

    // Then the tasks it was keeping have stopped, and nothing is scheduled.
    const after = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    assertArrayEmpty(after.taskArns);
    assertIdentical(background.pendingTaskCount, 0);
    assertIdentical(background.dueTaskCount, 0);

    const stopped = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [before.taskArns[0]] }),
    );

    assertIdentical(stopped.tasks?.[0]?.lastStatus, "STOPPED");
    assertStringIncludes(
      stopped.tasks[0].stoppedReason ?? "",
      "environment closing",
    );
  });

  it("closes again without doing anything again", async () => {
    // Given an environment that has already been closed.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({}, simAws);
    await simAws.backgroundTasksComplete();
    await simAws.close();

    // When it is closed again.
    await simAws.close();

    // Then there is still nothing running, and nothing raised.
    const listed = await simAws
      .ecs()
      .listTasks(new ListTasksCommand({ serviceName: "checkout" }));

    assertArrayEmpty(listed.taskArns);
  });

  it("brings nothing up for a service deleted before its tasks start", async () => {
    // Given a service whose tasks have not reached the background work yet.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsServiceFactory.make({ desiredCount: 2 }, simAws);

    const started = await ecs.listTasks(
      new ListTasksCommand({ serviceName: "checkout" }),
    );

    // When it is deleted before that work runs.
    await ecs.deleteService(
      new DeleteServiceCommand({ service: "checkout", force: true }),
    );
    await simAws.backgroundTasksComplete();

    // Then the tasks stay stopped rather than being brought up afterwards.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [...(started.taskArns ?? [])] }),
    );

    assertArrayLength(described.tasks, 2);
    assertIdentical(described.tasks[0].lastStatus, "STOPPED");
    assertIdentical(described.tasks[1].lastStatus, "STOPPED");
  });
});
