import {
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../../sdk/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsAccessDeniedException } from "../../error/sim-ecs.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("Authorizing what a simulated ECS task does", () => {
  it("attributes a container's AWS calls to the task Role", async () => {
    // Given a task Role allowed to write one SSM parameter.
    using simSdk = new SimSdk();
    const { simAws } = simSdk;
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const taskRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "OrdersTaskRole", actions: ["ssm:PutParameter"] },
      simAws,
    );

    // And a container that writes it through an ordinary SDK client.
    simSdk.intercept(SSMClient);
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: async () => {
        await new SSMClient({}).send(
          new PutParameterCommand({
            Name: "/orders/last-run",
            Value: "done",
            Type: "String",
          }),
        );
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        taskRoleArn: taskRole.Arn,
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await simAws.backgroundTasksComplete();

    // Then IAM allowed the call, so the container exited cleanly.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 0);
  });

  it("denies a call the task Role has no policy for", async () => {
    // Given a task Role allowed nothing.
    using simSdk = new SimSdk();
    const { simAws } = simSdk;
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const taskRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "NoPermissionsTaskRole", actions: [] },
      simAws,
    );

    // And a container that tries to write an SSM parameter.
    simSdk.intercept(SSMClient);
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: async () => {
        await new SSMClient({}).send(
          new PutParameterCommand({
            Name: "/orders/last-run",
            Value: "done",
            Type: "String",
          }),
        );
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        taskRoleArn: taskRole.Arn,
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await simAws.backgroundTasksComplete();

    // Then IAM denied the call, and the container stopped on it.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 1);
    assertStringIncludes(
      described.tasks[0].containers[0].reason ?? "",
      "not authorized to perform",
    );
  });

  it("runs a container as the task Role a RunTask override named", async () => {
    // Given a task definition declaring one task Role.
    using simSdk = new SimSdk();
    const { simAws } = simSdk;
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const declared = await simIamRoleWithPolicyFactory.make(
      { roleName: "DeclaredTaskRole", actions: [] },
      simAws,
    );
    const overriding = await simIamRoleWithPolicyFactory.make(
      { roleName: "OverridingTaskRole", actions: ["ssm:PutParameter"] },
      simAws,
    );

    simSdk.intercept(SSMClient);
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: async () => {
        await new SSMClient({}).send(
          new PutParameterCommand({
            Name: "/orders/last-run",
            Value: "done",
            Type: "String",
          }),
        );
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        taskRoleArn: declared.Arn,
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When the task is run with the other Role.
    const run = await ecs.runTask(
      new RunTaskCommand({
        taskDefinition: "orders-worker",
        overrides: { taskRoleArn: overriding.Arn },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the overriding Role's policy is the one that decided the call.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 0);
  });

  it("runs a container with no task Role as nobody", async () => {
    // Given a Role allowed to run tasks and to write an SSM parameter.
    using simSdk = new SimSdk();
    const { simAws } = simSdk;
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const starter = await simIamRoleWithPolicyFactory.make(
      { roleName: "Starter", actions: ["ecs:RunTask", "ssm:PutParameter"] },
      simAws,
    );

    // And a task definition declaring no task Role, whose container writes one.
    simSdk.intercept(SSMClient);
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: async () => {
        await new SSMClient({}).send(
          new PutParameterCommand({
            Name: "/orders/last-run",
            Value: "done",
            Type: "String",
          }),
        );
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        containerDefinitions: [{ name: "app", image: "orders-worker:1" }],
      }),
    );

    // When that Role runs the task, so its own permissions are the ambient
    // ones while the containers are scheduled.
    const run = await simAws.runAs(
      { kind: "arn", arn: starter.Arn },
      async () =>
        await ecs.runTask(
          new RunTaskCommand({ taskDefinition: "orders-worker" }),
        ),
    );
    await simAws.backgroundTasksComplete();

    // Then the container did not take the starter's identity: a real task with
    // no task Role has no credentials of its own.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 1);
    assertStringIncludes(
      described.tasks[0].containers[0].reason ?? "",
      "User: anonymous is not authorized",
    );
  });

  it("refuses a caller whose policy does not permit running the task", async () => {
    // Given a Role allowed to describe task definitions but not to run tasks.
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
    const role = await simIamRoleWithPolicyFactory.make(
      { roleName: "Reader", actions: ["ecs:DescribeTaskDefinition"] },
      simAws,
    );

    // When it runs a task.
    const error = await assertThrowsErrorAsync(async () =>
      ecs.runTask(new RunTaskCommand({ taskDefinition: "checkout" }), {
        caller: { kind: "arn", arn: role.Arn },
      }),
    );

    // Then the request is denied and nothing runs.
    assertInstanceOf(error, SimEcsAccessDeniedException);
    await simAws.backgroundTasksComplete();
    assertIdentical(runs, 0);
  });

  it("allows a caller whose policy names the task definition revision", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const registered = await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
      }),
    );

    // And a Role allowed to run that revision, which is the resource type real
    // ECS gives the action.
    const role = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Runner",
        actions: ["ecs:RunTask"],
        resource: registered.taskDefinition?.taskDefinitionArn ?? "",
      },
      simAws,
    );

    // When it runs a task.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "checkout" }),
      { caller: { kind: "arn", arn: role.Arn } },
    );

    // Then the request goes through.
    assertIdentical(run.tasks?.[0]?.lastStatus, "PROVISIONING");
    await simAws.backgroundTasksComplete();
  });
});
