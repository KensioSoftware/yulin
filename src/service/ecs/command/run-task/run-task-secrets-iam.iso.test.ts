import {
  DescribeTasksCommand,
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../../sdk/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("Authorizing a simulated ECS container's secrets", () => {
  it("reads the secret as the execution Role and runs the container as the task Role", async () => {
    // Given an execution Role allowed only to read the secret, and a task Role
    // allowed only what the container itself does.
    using simSdk = new SimSdk();
    const { simAws } = simSdk;
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const secret = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "orders/db", SecretString: "hunter2" }),
      );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersExecutionRole",
        actions: ["secretsmanager:GetSecretValue"],
      },
      simAws,
    );
    const taskRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "OrdersTaskRole", actions: ["ssm:PutParameter"] },
      simAws,
    );

    // And a container that reads the secret from its environment and writes a
    // parameter through an ordinary SDK client.
    let observed: string | undefined;
    simSdk.intercept(SSMClient);
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: async () => {
        observed = process.env["DB_PASSWORD"];
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
        executionRoleArn: executionRole.Arn,
        taskRoleArn: taskRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await simAws.backgroundTasksComplete();

    // Then both halves went through, which neither Role could have done on its
    // own: the execution Role cannot write the parameter, and the task Role
    // cannot read the secret.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(observed, "hunter2");
    assertIdentical(described.tasks?.[0]?.containers?.[0]?.exitCode, 0);
  });

  it("does not read the secret as the task Role", async () => {
    // Given a task Role allowed to read the secret and an execution Role
    // allowed nothing, which is the mistake the other way round.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const secret = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "orders/db", SecretString: "hunter2" }),
      );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "OrdersExecutionRole", actions: [] },
      simAws,
    );
    const taskRole = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersTaskRole",
        actions: ["secretsmanager:GetSecretValue"],
      },
      simAws,
    );

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
        executionRoleArn: executionRole.Arn,
        taskRoleArn: taskRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await simAws.backgroundTasksComplete();

    // Then the task failed to start naming the variable, and the bound handler
    // never ran, whatever the task Role was allowed.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );
    const task = described.tasks?.[0];
    assertNonNullable(task);
    const container = task.containers?.[0];
    assertNonNullable(container);

    assertIdentical(runs, 0);
    assertIdentical(task.lastStatus, "STOPPED");
    assertIdentical(task.stopCode, "TaskFailedToStart");
    assertStringIncludes(
      task.stoppedReason ?? "",
      "ResourceInitializationError: unable to pull secrets: DB_PASSWORD:",
    );
    assertStringIncludes(task.stoppedReason ?? "", "not authorized to perform");
    assertIdentical(container.lastStatus, "STOPPED");
    assertUndefined(container.exitCode);
  });

  it("stops a task whose definition declares secrets but no execution Role", async () => {
    // Given a container declaring a secret and a definition declaring no
    // executionRoleArn, which is the ordinary way to get this wrong.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const secret = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "orders/db", SecretString: "hunter2" }),
      );

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
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When the task runs.
    const run = await ecs.runTask(
      new RunTaskCommand({ taskDefinition: "orders-worker" }),
    );
    await simAws.backgroundTasksComplete();

    // Then it says there was no Role to read the secret as.
    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
    );

    assertIdentical(runs, 0);
    assertStringIncludes(
      described.tasks?.[0]?.stoppedReason ?? "",
      "declares no executionRoleArn",
    );
  });
});
