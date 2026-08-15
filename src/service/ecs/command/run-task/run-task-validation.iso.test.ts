import {
  DeregisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";
import {
  SimEcsClientException,
  SimEcsClusterNotFoundException,
  SimEcsInvalidParameterException,
} from "../../error/sim-ecs.error.js";

describe("Refusing a simulated ECS RunTask request", () => {
  it("refuses an input this simulation does not hold", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run with a network configuration.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask(
        new RunTaskCommand({
          taskDefinition: "checkout",
          networkConfiguration: {
            awsvpcConfiguration: { subnets: ["subnet-1"] },
          },
        }),
      ),
    );

    // Then it is refused rather than dropped, since there is no network here
    // for it to mean anything in.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "networkConfiguration");
    assertStringIncludes(error.message, "not simulated");
  });

  it("refuses an override this simulation does not hold", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run overriding the task's cpu.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask(
        new RunTaskCommand({
          taskDefinition: "checkout",
          overrides: { cpu: "1024" },
        }),
      ),
    );

    // Then it is refused: nothing here has cpu to override.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "RunTask overrides cpu");
  });

  it("refuses a container override this simulation does not hold", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run overriding the container's command.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask(
        new RunTaskCommand({
          taskDefinition: "checkout",
          overrides: {
            containerOverrides: [{ name: "app", command: ["node", "job.js"] }],
          },
        }),
      ),
    );

    // Then it is refused, since Yulin never runs an image and has no command
    // to replace.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "RunTask containerOverrides command");
  });

  it("refuses a container override naming a container that is not declared", async () => {
    // Given a task definition declaring one container named app.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run overriding a container named something else.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask(
        new RunTaskCommand({
          taskDefinition: "checkout",
          overrides: {
            containerOverrides: [
              { name: "worker", environment: [{ name: "A", value: "1" }] },
            ],
          },
        }),
      ),
    );

    // Then it is refused rather than silently doing nothing.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "worker");
  });

  it("refuses a cluster that is not there", async () => {
    // Given a registered task definition and no cluster of that name.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run in it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .runTask(
          new RunTaskCommand({ taskDefinition: "checkout", cluster: "nope" }),
        ),
    );

    // Then it is reported as ECS reports it.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
    assertStringIncludes(error.message, "nope");
  });

  it("refuses a task definition that is not there", async () => {
    // Given simulated ECS with a cluster and nothing registered.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a task is run from a family nothing registered.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask(new RunTaskCommand({ taskDefinition: "missing" })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "missing");
  });

  it("refuses a revision that has been deregistered", async () => {
    // Given a task definition revision that has been deregistered.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When a task is run from that revision.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .runTask(new RunTaskCommand({ taskDefinition: "checkout:1" })),
    );

    // Then it is refused, as real ECS refuses to run an inactive revision.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "INACTIVE");
  });

  it("refuses a count outside the range real ECS takes", async () => {
    // Given a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a task is run asking for more tasks than ECS starts at once.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .runTask(new RunTaskCommand({ taskDefinition: "checkout", count: 11 })),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "1 to 10");
  });

  it("refuses a request naming no task definition", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a task is run without naming one.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().runTask({ input: {} }),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "task definition family");
  });
});
