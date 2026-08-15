import {
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs";
import {
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
  SimEcsInvalidParameterException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

describe("ECS StopTaskCommand", () => {
  it("stops a task before its containers run", async () => {
    // Given a task that has been started but not yet run.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let runs = 0;
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        runs += 1;
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    const taskArn = run.tasks?.[0]?.taskArn ?? "";

    // When it is stopped.
    const stopped = await ecs.stopTask(
      new StopTaskCommand({ task: taskArn, reason: "not needed after all" }),
    );

    // Then the desired status changes first, as it does on real ECS.
    assertIdentical(stopped.task?.desiredStatus, "STOPPED");
    assertIdentical(stopped.task.lastStatus, "PROVISIONING");

    // And the handler never runs, with the reason kept as the request gave it.
    await simAws.backgroundTasksComplete();

    assertIdentical(runs, 0);

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [taskArn] }),
    );

    assertIdentical(described.tasks?.[0]?.lastStatus, "STOPPED");
    assertIdentical(described.tasks[0].stopCode, "UserInitiated");
    assertIdentical(described.tasks[0].stoppedReason, "not needed after all");
  });

  it("records a default reason when the request gives none", async () => {
    // Given a task that has been started.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));

    // When it is stopped without a reason.
    const stopped = await simAws
      .ecs()
      .stopTask(new StopTaskCommand({ task: run.tasks?.[0]?.taskArn ?? "" }));

    // Then it still says why it stopped.
    assertStringIncludes(stopped.task?.stoppedReason ?? "", "user request");

    await simAws.backgroundTasksComplete();
  });

  it("leaves a task that has already stopped as it is", async () => {
    // Given a task that has run to completion.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    await simAws.backgroundTasksComplete();

    // When it is stopped afterwards.
    const stopped = await simAws.ecs().stopTask(
      new StopTaskCommand({
        task: run.tasks?.[0]?.taskArn ?? "",
        reason: "too late",
      }),
    );

    // Then it keeps the reason it stopped for, rather than taking this one.
    assertIdentical(stopped.task?.lastStatus, "STOPPED");
    assertIdentical(stopped.task.stopCode, "TaskFailedToStart");
  });

  it("refuses a task that is not there", async () => {
    // Given a cluster with no tasks in it.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a task nothing started is stopped.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .stopTask(
          new StopTaskCommand({ task: "0123456789abcdef0123456789abcdef" }),
        ),
    );

    // Then it is refused, as real ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "was not found");
  });

  it("refuses a request naming no task", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a task is stopped without naming one.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().stopTask({ input: {} }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "needs the task to stop");
  });

  it("stops the containers a running task has not reached yet", async () => {
    // Given a task whose first container stops the task while it runs.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let secondRuns = 0;
    let taskArn = "";
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: async () => {
        await ecs.stopTask(new StopTaskCommand({ task: taskArn }));
      },
    });
    ecs.bindContainer({
      family: "checkout",
      containerName: "sidecar",
      run: () => {
        secondRuns += 1;
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          { name: "app", image: "checkout:1" },
          { name: "sidecar", image: "sidecar:1" },
        ],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    taskArn = run.tasks?.[0]?.taskArn ?? "";
    await simAws.backgroundTasksComplete();

    // Then the container after the one that stopped it never ran.
    assertIdentical(secondRuns, 0);

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [taskArn] }),
    );

    assertIdentical(described.tasks?.[0]?.stopCode, "UserInitiated");
    assertIdentical(described.tasks[0].containers?.[0]?.exitCode, 0);
  });
});
