import {
  CreateServiceCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ListTasksCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("A simulated ECS service whose containers declare secrets", () => {
  it("brings its tasks up once their secrets can be read", async () => {
    // Given a secret and a task definition reading it as its execution Role.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);

    const secret = await simAws
      .secretsManager()
      .createSecret(
        new CreateSecretCommand({ Name: "orders/db", SecretString: "hunter2" }),
      );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "Execution", actions: ["secretsmanager:GetSecretValue"] },
      simAws,
    );

    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "checkout:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When a service is created from it.
    await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 2,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then its tasks are running, as they are for a definition with no secret
    // to read at all.
    const described = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(described.services?.[0]?.runningCount, 2);
  });

  it("stops a task whose secret cannot be read", async () => {
    // Given a container declaring a secret that is not there.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "Execution", actions: ["secretsmanager:GetSecretValue"] },
      simAws,
    );
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "checkout:1",
            secrets: [
              {
                name: "DB_PASSWORD",
                valueFrom: `arn:aws:secretsmanager:${simAws.defaultRegionName}:${simAws.defaultAccountId}:secret:orders/db-AbCdEf`,
              },
            ],
          },
        ],
      }),
    );

    // When a service is created from it.
    await ecs.createService(
      new CreateServiceCommand({
        serviceName: "checkout",
        taskDefinition: "checkout",
        desiredCount: 1,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the task it started stopped before anything of it ran, as one
    // started by `RunTask` does, rather than the service reporting it running.
    const stopped = await ecs.listTasks(
      new ListTasksCommand({
        serviceName: "checkout",
        desiredStatus: "STOPPED",
      }),
    );

    assertArrayLength(stopped.taskArns, 1);

    const described = await ecs.describeTasks(
      new DescribeTasksCommand({ tasks: [stopped.taskArns[0]] }),
    );

    assertIdentical(described.tasks?.[0]?.stopCode, "TaskFailedToStart");
    assertStringIncludes(
      described.tasks[0].stoppedReason ?? "",
      "ResourceInitializationError",
    );

    // And the service reports the running count it actually has, rather than
    // starting replacements the way real ECS keeps retrying.
    const services = await ecs.describeServices(
      new DescribeServicesCommand({ services: ["checkout"] }),
    );

    assertIdentical(services.services?.[0]?.runningCount, 0);
    assertIdentical(services.services[0].desiredCount, 1);
  });
});
