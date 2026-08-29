import {
  RegisterTaskDefinitionCommand,
  RunTaskCommand,
} from "@aws-sdk/client-ecs";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { PutParameterCommand } from "@aws-sdk/client-ssm";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

describe("Resolving a simulated ECS container's secrets", () => {
  it("puts a Secrets Manager secret in the container's environment", async () => {
    // Given a secret and an execution Role allowed to read it.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const secret = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "orders/db",
        SecretString: "hunter2",
      }),
    );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersExecutionRole",
        actions: ["secretsmanager:GetSecretValue"],
      },
      simAws,
    );

    // And a container declaring it as DB_PASSWORD.
    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["DB_PASSWORD"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
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
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then the handler read the secret's value through process.env.
    assertIdentical(observed, "hunter2");
  });

  it("puts an SSM SecureString parameter in the container's environment", async () => {
    // Given a SecureString parameter and an execution Role allowed to read it.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/orders/api-key",
        Type: "SecureString",
        Value: "k-1234",
      }),
    );
    // The parameter is under the aws/ssm managed key, whose policy allows the
    // decryption on its own, so the execution Role needs no KMS permission.
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "OrdersExecutionRole", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // And a container declaring it by its parameter ARN.
    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["API_KEY"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [
              {
                name: "API_KEY",
                valueFrom:
                  `arn:aws:ssm:${simAws.defaultRegionName}:` +
                  `${simAws.defaultAccountId}:parameter/orders/api-key`,
              },
            ],
          },
        ],
      }),
    );

    // When the task runs.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then the handler read the decrypted value.
    assertIdentical(observed, "k-1234");
  });

  it("reads a parameter named without its ARN in the task's own region", async () => {
    // Given a parameter and an execution Role allowed to read it.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    await simAws.ssm().putParameter(
      new PutParameterCommand({
        Name: "/orders/api-key",
        Type: "String",
        Value: "k-5678",
      }),
    );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      { roleName: "OrdersExecutionRole", actions: ["ssm:GetParameter"] },
      simAws,
    );

    // And a container naming it by name alone, as real ECS allows for a
    // parameter in the task's own region.
    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["API_KEY"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "API_KEY", valueFrom: "/orders/api-key" }],
          },
        ],
      }),
    );

    // When the task runs.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then the parameter resolved just as its ARN would have.
    assertIdentical(observed, "k-5678");
  });

  it("resolves the JSON key a Secrets Manager valueFrom selects", async () => {
    // Given a secret holding a JSON object of connection details.
    const simAws = new SimAws();
    const ecs = simAws.ecs();
    await simEcsClusterFactory.make({}, simAws);
    const secret = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "orders/db",
        SecretString: JSON.stringify({
          username: "orders",
          password: "s3cr3t",
        }),
      }),
    );
    const executionRole = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "OrdersExecutionRole",
        actions: ["secretsmanager:GetSecretValue"],
      },
      simAws,
    );

    // And a container selecting one key of it, as a CDK construct given a
    // field writes the valueFrom.
    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["DB_PASSWORD"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [
              {
                name: "DB_PASSWORD",
                valueFrom: `${String(secret.ARN)}:password::`,
              },
            ],
          },
        ],
      }),
    );

    // When the task runs.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then that key's value is the variable, rather than the whole document.
    assertIdentical(observed, "s3cr3t");
  });

  it("lets a secret replace a declared environment variable of the same name", async () => {
    // Given a secret and a container declaring the same variable in plaintext.
    const simAws = new SimAws();
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

    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["DB_PASSWORD"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            environment: [{ name: "DB_PASSWORD", value: "placeholder" }],
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When the task runs.
    await ecs.runTask(new RunTaskCommand({ taskDefinition: "orders-worker" }));
    await simAws.backgroundTasksComplete();

    // Then the secret won, since a plaintext variable of the same name is what
    // a secret was introduced to replace.
    assertIdentical(observed, "hunter2");
  });

  it("lets a RunTask override replace a resolved secret", async () => {
    // Given a container whose DB_PASSWORD comes from a secret.
    const simAws = new SimAws();
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

    let observed: string | undefined;
    ecs.bindContainer({
      family: "orders-worker",
      containerName: "app",
      run: () => {
        observed = process.env["DB_PASSWORD"];
      },
    });
    await ecs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "orders-worker",
        executionRoleArn: executionRole.Arn,
        containerDefinitions: [
          {
            name: "app",
            image: "orders-worker:1",
            secrets: [{ name: "DB_PASSWORD", valueFrom: secret.ARN }],
          },
        ],
      }),
    );

    // When the task is run with an override setting the same variable.
    await ecs.runTask(
      new RunTaskCommand({
        taskDefinition: "orders-worker",
        overrides: {
          containerOverrides: [
            {
              name: "app",
              environment: [{ name: "DB_PASSWORD", value: "overridden" }],
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the override won, since it is what the caller asked for at the
    // moment the task was started.
    assertIdentical(observed, "overridden");
  });
});
