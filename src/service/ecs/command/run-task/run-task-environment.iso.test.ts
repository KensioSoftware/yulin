import {
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("The environment a simulated ECS container runs with", () => {
  it("makes the container definition's environment visible to the handler", async () => {
    // Given a container declaring environment variables.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let observed: string | undefined;
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        observed = process.env["QUEUE_NAME"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          {
            name: "app",
            image: "checkout:1",
            environment: [{ name: "QUEUE_NAME", value: "orders" }],
          },
        ],
      }),
    );

    // When a task is run.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    await simAws.backgroundTasksComplete();

    // Then the handler read the declared value, and nothing was left behind in
    // the host environment.
    assertIdentical(observed, "orders");
    assertUndefined(process.env["QUEUE_NAME"]);
  });

  it("lets a RunTask container override replace a declared variable", async () => {
    // Given a container declaring a batch size.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["BATCH_SIZE"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            environment: [{ name: "BATCH_SIZE", value: "100" }],
          },
        ],
      }),
    );

    // When a task is run overriding it.
    await ecs.runTask(
      new RunTaskCommand({
        taskDefinition: "orders-worker",
        overrides: {
          containerOverrides: [
            { name: "app", environment: [{ name: "BATCH_SIZE", value: "10" }] },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the override is what the handler read, as it is on real ECS.
    assertIdentical(observed, "10");
  });

  it("gives a container an environment the override alone supplies", async () => {
    // Given a container declaring no environment of its own.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const observed: (string | undefined)[] = [];
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        observed.push(process.env["RUN_MODE"]);
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run overriding a variable it never declared.
    await ecs.runTask(
      new RunTaskCommand({
        taskDefinition: "checkout",
        overrides: {
          containerOverrides: [
            { name: "app", environment: [{ name: "RUN_MODE", value: "dry" }] },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the handler read it, as real ECS adds an overridden variable that
    // the container definition does not have.
    assertIdentical(observed[0], "dry");
  });

  it("sets the Region variables a task agent sets", async () => {
    // Given a container in a known Region declaring one variable of its own.
    const simAws = new SimAws();
    const ecs = simAws.account("222222222222").region("eu-west-2").ecs();
    await ecs.createCluster({ input: {} });
    let observed: string | undefined;
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        observed = process.env["AWS_REGION"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [
          {
            name: "app",
            image: "checkout:1",
            environment: [{ name: "LOG_LEVEL", value: "debug" }],
          },
        ],
      }),
    );

    // When a task is run.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    await simAws.backgroundTasksComplete();

    // Then the handler found the Region it runs in.
    assertIdentical(observed, "eu-west-2");
  });

  it("gives a container declaring nothing the host environment and the Region", async () => {
    // Given a container with no environment of its own, in a known Region.
    const simAws = new SimAws();
    const ecs = simAws.account("222222222222").region("eu-west-2").ecs();
    await ecs.createCluster({ input: {} });
    process.env["YULIN_ECS_HOST_VARIABLE"] = "host";
    process.env["AWS_REGION"] = "ap-south-1";
    const observed: Record<string, string | undefined> = {};
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        observed["host"] = process.env["YULIN_ECS_HOST_VARIABLE"];
        observed["region"] = process.env["AWS_REGION"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    await simAws.backgroundTasksComplete();

    delete process.env["YULIN_ECS_HOST_VARIABLE"];
    delete process.env["AWS_REGION"];

    // Then it read the host environment it would have read anyway, with the
    // task's own Region over the top rather than the one the machine running
    // the test is configured for. A client the container builds is reached by
    // the same variable, so it talks to the Region the task runs in.
    assertIdentical(observed["host"], "host");
    assertIdentical(observed["region"], "eu-west-2");
  });
});
