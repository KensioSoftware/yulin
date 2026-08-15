import { ListTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

describe("ECS ListTasksCommand", () => {
  it("lists the tasks that are meant to be running", async () => {
    // Given a task that has been started and not yet run.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));

    // When the tasks are listed.
    const listed = await simAws.ecs().listTasks(new ListTasksCommand({}));

    // Then it is in the listing, which filters on RUNNING when the request
    // says nothing, as real ECS does.
    assertArrayLength(listed.taskArns, 1);
    assertIdentical(listed.taskArns[0], run.tasks?.[0]?.taskArn);

    await simAws.backgroundTasksComplete();
  });

  it("leaves out a task that has stopped until the request asks for it", async () => {
    // Given a task that has run and stopped.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    await simAws.backgroundTasksComplete();

    // When the tasks are listed without a desired status.
    const running = await simAws.ecs().listTasks(new ListTasksCommand({}));

    // Then the stopped task is not one of them.
    assertArrayLength(running.taskArns, 0);

    // And it is there when the stopped ones are asked for.
    const stopped = await simAws
      .ecs()
      .listTasks(new ListTasksCommand({ desiredStatus: "STOPPED" }));

    assertArrayLength(stopped.taskArns, 1);
  });

  it("filters by family and by what started the task", async () => {
    // Given tasks of two families, one of them started by something named.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make(
      { family: "billing" },
      simAws,
    );
    const checkout = await simAws.ecs().runTask(
      new RunTaskCommand({
        taskDefinition: "checkout",
        startedBy: "nightly-batch",
      }),
    );
    const billing = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "billing" }));

    // When the listing names a family.
    const byFamily = await simAws
      .ecs()
      .listTasks(new ListTasksCommand({ family: "billing" }));

    // Then only that family's task is listed.
    assertArrayLength(byFamily.taskArns, 1);
    assertIdentical(byFamily.taskArns[0], billing.tasks?.[0]?.taskArn);

    // And the same holds for what started it.
    const byStarter = await simAws
      .ecs()
      .listTasks(new ListTasksCommand({ startedBy: "nightly-batch" }));

    assertArrayLength(byStarter.taskArns, 1);
    assertIdentical(byStarter.taskArns[0], checkout.tasks?.[0]?.taskArn);

    await simAws.backgroundTasksComplete();
  });

  it("pages a listing at the size the request asked for", async () => {
    // Given three tasks.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout", count: 3 }));

    // When the first page of two is listed.
    const first = await simAws
      .ecs()
      .listTasks(new ListTasksCommand({ maxResults: 2 }));

    // Then it carries a token to the rest.
    assertArrayLength(first.taskArns, 2);

    const second = await simAws
      .ecs()
      .listTasks(
        new ListTasksCommand({ maxResults: 2, nextToken: first.nextToken }),
      );

    assertArrayLength(second.taskArns, 1);
    assertUndefined(second.nextToken);

    await simAws.backgroundTasksComplete();
  });

  it("refuses a desired status this simulation cannot answer for", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When the tasks wanted PENDING are listed.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .listTasks(new ListTasksCommand({ desiredStatus: "PENDING" })),
    );

    // Then it is refused rather than answered with an empty listing that looks
    // like a result.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "PENDING");
  });

  it("refuses a desired status ECS does not have", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When the tasks are listed by a status that is not one.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().listTasks({ input: { desiredStatus: "PROVISIONING" } }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "RUNNING or STOPPED");
  });
});
