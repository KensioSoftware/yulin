import {
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertSetSize,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("ECS RunTaskCommand", () => {
  it("runs the handler bound to a container of the task definition", async () => {
    // Given a task definition whose container is bound to a handler.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let runs = 0;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        runs += 1;
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When a task is run from it.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );

    // Then the task is answered before anything has started, as real ECS
    // answers one.
    assertArrayLength(run.tasks, 1);
    assertIdentical(run.tasks[0].lastStatus, "PROVISIONING");
    assertIdentical(run.tasks[0].desiredStatus, "RUNNING");
    assertIdentical(run.tasks[0].group, "family:orders-worker");

    // And once the simulation's background work is done, the handler has run
    // and the task has stopped carrying its exit code.
    await simAws.backgroundTasksComplete();

    assertIdentical(runs, 1);

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks[0].taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.lastStatus, "STOPPED");
    assertIdentical(described.tasks[0].desiredStatus, "STOPPED");
    assertIdentical(described.tasks[0].stopCode, "EssentialContainerExited");
    assertIdentical(described.tasks[0].containers?.[0]?.exitCode, 0);
    assertIdentical(described.tasks[0].containers[0].lastStatus, "STOPPED");
  });

  it("records an unbound container as not simulated", async () => {
    // Given a task definition holding a bound application container and an
    // unbound log router, which is the ordinary shape of a real one.
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
        containerDefinitions: [
          { name: "app", image: "checkout:1" },
          { name: "log-router", image: "aws-for-fluent-bit:latest" },
        ],
      }),
    );

    // When a task is run.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the bound container ran, and the unbound one is reported with no
    // exit code and a reason rather than failing anything.
    assertIdentical(runs, 1);

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );
    const containers = described.tasks?.[0]?.containers ?? [];

    assertArrayLength(containers, 2);
    assertIdentical(containers[0].exitCode, 0);
    assertUndefined(containers[1].exitCode);
    assertStringIncludes(containers[1].reason ?? "", "Not simulated");
    assertIdentical(described.tasks?.[0]?.stopCode, "EssentialContainerExited");
  });

  it("creates the task state anyway when nothing is bound", async () => {
    // Given a task definition with no binding at all.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run from it.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the task exists and records that nothing ran, rather than looking
    // like a task whose containers finished.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.lastStatus, "STOPPED");
    assertIdentical(described.tasks[0].stopCode, "TaskFailedToStart");
    assertStringIncludes(
      described.tasks[0].stoppedReason ?? "",
      "bound to a simulated handler",
    );
    assertUndefined(described.tasks[0].containers?.[0]?.exitCode);
  });

  it("stops the task with a non-zero exit code when a handler throws", async () => {
    // Given a container whose handler throws.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        throw new Error("no orders to process");
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run, the request itself does not fail.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the container carries the non-zero exit code and the reason.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 1);
    assertIdentical(
      described.tasks[0].containers[0].reason,
      "no orders to process",
    );
    assertIdentical(described.tasks[0].stopCode, "EssentialContainerExited");
  });

  it("records what a handler threw when it was not an Error", async () => {
    // Given a container whose handler throws a bare value.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    ecs.bindContainer({
      family: "checkout",
      containerName: "app",
      run: () => {
        // A container that ends on something other than an Error still has to
        // report why it stopped.
        // oxlint-disable-next-line typescript/only-throw-error
        throw "no orders";
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // When a task is run.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the container still reports what stopped it.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 1);
    assertIdentical(described.tasks[0].containers[0].reason, "no orders");
  });

  it("binds a container by the repository its image comes from", async () => {
    // Given a binding naming an image repository rather than a container.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    let runs = 0;
    ecs.bindContainer({
      imageRepository: "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders",
      run: () => {
        runs += 1;
      },
    });

    // And a task definition whose container runs an image from it, tagged with
    // a content hash the test could never have written down.
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        containerDefinitions: [
          {
            name: "app",
            image:
              "111111111111.dkr.ecr.eu-west-2.amazonaws.com/orders:8f2c1a9b",
          },
        ],
      }),
    );

    // When a task is run.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then the binding matched, tag and all.
    assertIdentical(runs, 1);
  });

  it("runs the number of tasks the request asked for", async () => {
    // Given a bound container.
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

    // When three tasks are run in one request.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout", count: 3 }),
    );
    await simAws.backgroundTasksComplete();

    // Then each one is a task of its own, and each one ran.
    assertArrayLength(run.tasks, 3);
    assertSetSize(new Set(run.tasks.map((task) => task.taskArn)), 3);
    assertIdentical(runs, 3);
  });

  it("records the group, launch type and starter the request gave", async () => {
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

    // When a task is run naming all three.
    const run = await ecs.runTask(
      new RunTaskCommand({
        taskDefinition: "checkout",
        group: "nightly",
        launchType: "FARGATE",
        startedBy: "batch-runner",
      }),
    );

    // Then the task reports them as ECS reports them.
    assertIdentical(run.tasks?.[0]?.group, "nightly");
    assertIdentical(run.tasks[0].launchType, "FARGATE");
    assertIdentical(run.tasks[0].startedBy, "batch-runner");
  });
});
