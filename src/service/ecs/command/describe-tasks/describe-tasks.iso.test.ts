import {
  CreateClusterCommand,
  DescribeTasksCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";
import {
  SimEcsAccessDeniedException,
  SimEcsClientException,
  SimEcsClusterNotFoundException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

describe("ECS DescribeTasksCommand", () => {
  it("describes a task by its id as well as by its ARN", async () => {
    // Given a task that has been run.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    const taskArn = run.tasks?.[0]?.taskArn ?? "";

    // When it is described by the id at the end of its ARN.
    const taskId = taskArn.split("/").at(-1) ?? "";
    const described = await simAws
      .ecs()
      .describeTasks(new DescribeTasksCommand({ tasks: [taskId] }));

    // Then it is the same task, reported with its containers.
    assertArrayLength(described.tasks, 1);
    assertIdentical(described.tasks[0].taskArn, taskArn);
    assertArrayLength(described.tasks[0].containers, 1);
    assertIdentical(described.tasks[0].containers[0].name, "app");

    await simAws.backgroundTasksComplete();
  });

  it("reports a task it cannot find as a MISSING failure", async () => {
    // Given a cluster with no tasks in it.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When a task id nothing started is described.
    const described = await simAws.ecs().describeTasks(
      new DescribeTasksCommand({
        tasks: ["0123456789abcdef0123456789abcdef"],
      }),
    );

    // Then it is a failure entry rather than an error, as real ECS reports it.
    assertArrayLength(described.tasks, 0);
    assertArrayLength(described.failures, 1);
    assertIdentical(described.failures[0].reason, "MISSING");
    assertStringIncludes(
      described.failures[0].arn ?? "",
      ":task/default/0123456789abcdef0123456789abcdef",
    );
  });

  it("reports a task of another cluster as missing", async () => {
    // Given a task running in the default cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .createCluster(new CreateClusterCommand({ clusterName: "other" }));
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));

    // When it is described under a different cluster.
    const described = await simAws.ecs().describeTasks(
      new DescribeTasksCommand({
        cluster: "other",
        tasks: [run.tasks?.[0]?.taskArn ?? ""],
      }),
    );

    // Then it names no task there, since a task belongs to its own cluster.
    assertArrayLength(described.tasks, 0);
    assertArrayLength(described.failures, 1);

    await simAws.backgroundTasksComplete();
  });

  it("describes a task named by an ARN in the older format", async () => {
    // Given a task that has been run.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    const taskId = (run.tasks?.[0]?.taskArn ?? "").split("/").at(-1) ?? "";

    // When it is described by an ARN that leaves the cluster out, which is the
    // format ECS task ARNs had before the long ARN format.
    const older = `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:task/${taskId}`;
    const described = await simAws
      .ecs()
      .describeTasks(new DescribeTasksCommand({ tasks: [older] }));

    // Then it names the task in the cluster the request named.
    assertArrayLength(described.tasks, 1);
    assertIdentical(described.tasks[0].taskArn, run.tasks?.[0]?.taskArn);

    await simAws.backgroundTasksComplete();
  });

  it("reports an ARN that names something other than a task as missing", async () => {
    // Given a cluster and a registered task definition.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    const registered = await simEcsRegisteredTaskDefinitionFactory.make(
      {},
      simAws,
    );

    // When tasks are described by the task definition's ARN.
    const described = await simAws.ecs().describeTasks(
      new DescribeTasksCommand({
        tasks: [registered.taskDefinitionArn ?? ""],
      }),
    );

    // Then it names no task, and is reported as it came.
    assertArrayLength(described.tasks, 0);
    assertArrayLength(described.failures, 1);
    assertIdentical(described.failures[0].arn, registered.taskDefinitionArn);
    assertIdentical(described.failures[0].reason, "MISSING");
  });

  it("raises for a cluster that is not there", async () => {
    // Given simulated ECS with no cluster of that name.
    const simAws = new SimAws();

    // When tasks are described in it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeTasks(
          new DescribeTasksCommand({ cluster: "nope", tasks: ["abcdef"] }),
        ),
    );

    // Then it raises rather than reporting every task as missing.
    assertInstanceOf(error, SimEcsClusterNotFoundException);
  });

  it("refuses a request naming no task", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When tasks are described without naming any.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeTasks(new DescribeTasksCommand({ tasks: [] })),
    );

    // Then it is refused, since there is nothing to describe.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "at least one task");
  });

  it("refuses more tasks than one request may name", async () => {
    // Given a cluster.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);

    // When more tasks are named than real ECS takes at once.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeTasks(
        new DescribeTasksCommand({
          tasks: Array.from({ length: 101 }, (_, index) => `task-${index}`),
        }),
      ),
    );

    // Then it is refused.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "at most 100 tasks");
  });

  it("authorizes each task against its own ARN", async () => {
    // Given a task, and a Role allowed to describe a different one.
    const simAws = new SimAws();
    await simEcsClusterFactory.make({}, simAws);
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const run = await simAws
      .ecs()
      .runTask(new RunTaskCommand({ taskDefinition: "checkout" }));
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "TaskReader",
        actions: ["ecs:DescribeTasks"],
        resource: `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:task/default/somethingelse`,
      },
      simAws,
    );

    // When it describes the task its policy does not name.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeTasks(
          new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
          { caller: { kind: "arn", arn: role.Arn } },
        ),
    );

    // Then it is denied, so a policy can name one task.
    assertInstanceOf(error, SimEcsAccessDeniedException);

    await simAws.backgroundTasksComplete();
  });
});
