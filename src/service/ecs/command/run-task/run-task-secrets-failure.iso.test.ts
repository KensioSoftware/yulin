import { DescribeTasksCommand, RunTaskCommand } from "@aws-sdk/client-ecs";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimEcsSecret } from "../../task-definition/container/sim-ecs-container-parts.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { simEcsClusterFactory } from "../../cluster/sim-ecs-cluster.factory.js";

/**
 * Run one task whose container declares the given secrets, and answer with the
 * reason it stopped and how many times its handler ran.
 *
 * Every test here is about a secret that cannot become an environment
 * variable, and the only thing that differs between them is the declaration,
 * so the execution Role is allowed to read everything and the rest is the same
 * task each time.
 */
async function stoppedTaskFor(
  simAws: SimAws,
  secrets: readonly SimEcsSecret[],
): Promise<{ reason: string; runs: number }> {
  const ecs = simAws.ecs();
  await simEcsClusterFactory.make({}, simAws);
  const executionRole = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrdersExecutionRole",
      actions: ["secretsmanager:GetSecretValue", "ssm:GetParameter"],
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
  // Registered through the structural command rather than the SDK one,
  // because some of these declarations are ones the SDK's own types refuse
  // to express and a running task still has to deal with.
  await ecs.registerTaskDefinition({
    input: {
      family: "orders-worker",
      executionRoleArn: executionRole.Arn,
      containerDefinitions: [
        { name: "app", image: "orders-worker:1", secrets },
      ],
    },
  });

  const run = await ecs.runTask(
    new RunTaskCommand({ taskDefinition: "orders-worker" }),
  );
  await simAws.backgroundTasksComplete();

  const described = await ecs.describeTasks(
    new DescribeTasksCommand({ tasks: [run.tasks?.[0]?.taskArn ?? ""] }),
  );

  return { reason: described.tasks?.[0]?.stoppedReason ?? "", runs };
}

describe("A simulated ECS container secret that cannot be resolved", () => {
  it("stops the task when the secret does not exist", async () => {
    // Given a container naming a secret nothing created.
    const simAws = new SimAws();

    // When the task runs.
    const stopped = await stoppedTaskFor(simAws, [
      {
        name: "DB_PASSWORD",
        valueFrom:
          `arn:aws:secretsmanager:${simAws.defaultRegionName}:` +
          `${simAws.defaultAccountId}:secret:orders/db-AbCdEf`,
      },
    ]);

    // Then the reason says the secret is missing, which is a different problem
    // from a Role that may not read one.
    assertIdentical(stopped.runs, 0);
    assertStringIncludes(stopped.reason, "unable to pull secrets: DB_PASSWORD");
    assertStringIncludes(stopped.reason, "can't find the specified secret");
  });

  it("stops the task when the parameter does not exist", async () => {
    // Given a container naming a parameter nothing put.
    const simAws = new SimAws();

    // When the task runs.
    const stopped = await stoppedTaskFor(simAws, [
      { name: "API_KEY", valueFrom: "/orders/api-key" },
    ]);

    // Then the reason names the variable and says the parameter is not there.
    assertIdentical(stopped.runs, 0);
    assertStringIncludes(stopped.reason, "unable to pull secrets: API_KEY");
    assertStringIncludes(stopped.reason, "not found");
  });

  it("stops the task when a secret sets no environment variable", async () => {
    // Given a secret entry with nothing to set.
    const simAws = new SimAws();

    // When the task runs.
    const stopped = await stoppedTaskFor(simAws, [
      { valueFrom: "/orders/api-key" },
    ]);

    // Then it says so, rather than reading a value nothing could have used.
    assertIdentical(stopped.runs, 0);
    assertStringIncludes(stopped.reason, "sets no environment variable");
  });

  it("stops the task when a secret names nothing to read", async () => {
    // Given a secret entry naming a variable and no source.
    const simAws = new SimAws();

    // When the task runs.
    const stopped = await stoppedTaskFor(simAws, [{ name: "API_KEY" }]);

    // Then the reason names the variable that would have been empty.
    assertIdentical(stopped.runs, 0);
    assertStringIncludes(stopped.reason, "unable to pull secrets: API_KEY");
    assertStringIncludes(stopped.reason, "names no secret to read");
  });

  it("stops the task when the secret holds binary rather than text", async () => {
    // Given a secret created with a binary value.
    const simAws = new SimAws();
    const secret = await simAws.secretsManager().createSecret(
      new CreateSecretCommand({
        Name: "orders/keystore",
        SecretBinary: new Uint8Array([1, 2, 3]),
      }),
    );

    // When a container declares it as a variable.
    const stopped = await stoppedTaskFor(simAws, [
      { name: "KEYSTORE", valueFrom: secret.ARN },
    ]);

    // Then it is refused, since an environment variable can only be text.
    assertIdentical(stopped.runs, 0);
    assertStringIncludes(stopped.reason, "holds a binary value");
  });
});
