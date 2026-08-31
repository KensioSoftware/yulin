import { RegisterTaskDefinitionCommand } from "@aws-sdk/client-ecs";
import {
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../ecs/cluster/sim-ecs-cluster.factory.js";

const clusterArn = "arn:aws:ecs:us-east-1:888888888888:cluster/default";

const roleArn = "arn:aws:iam::888888888888:role/EventsRole";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * A simulation with a cluster, and a role that trusts EventBridge and is
 * allowed exactly what one policy statement says.
 */
async function simulationWithRole(
  statement: object,
  trusts = "events.amazonaws.com",
): Promise<SimAws> {
  const simAws = new SimAws();

  await simEcsClusterFactory.make({}, simAws);

  await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "EventsRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: trusts },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "EventsRole",
      PolicyName: "RunTasks",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: statement,
      }),
    }),
  );

  return simAws;
}

/**
 * A simulation whose role may run any task.
 */
async function simulationAllowedToRunTasks(): Promise<SimAws> {
  return await simulationWithRole({
    Effect: "Allow",
    Action: "ecs:RunTask",
    Resource: "*",
  });
}

/**
 * A task definition of one container, bound to the handler given.
 */
async function boundTaskDefinition(
  simAws: SimAws,
  run: () => void,
  environment: readonly { name: string; value: string }[] = [],
): Promise<void> {
  simAws.ecs().bindContainer({
    family: "nightly-import",
    containerName: "app",
    run,
  });

  await simAws.ecs().registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "nightly-import",
      containerDefinitions: [
        {
          name: "app",
          image: "nightly-import:1",
          environment: [...environment],
        },
      ],
    }),
  );
}

/**
 * A rule matching order events, with one ECS target on it.
 */
async function ruleRunningTask(
  simAws: SimAws,
  target: {
    readonly TaskCount?: number;
    readonly Input?: string;
  } = {},
): Promise<void> {
  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );

  await simAws.eventBridge().putTargets(
    new PutTargetsCommand({
      Rule: "orders",
      Targets: [
        {
          Id: "import",
          Arn: clusterArn,
          RoleArn: roleArn,
          Input: target.Input,
          EcsParameters: {
            TaskDefinitionArn: "nightly-import",
            TaskCount: target.TaskCount,
          },
        },
      ],
    }),
  );
}

/**
 * Put one matching event and settle everything it caused.
 */
async function putOrderEvent(simAws: SimAws): Promise<void> {
  await simAws.eventBridge().putEvents(
    new PutEventsCommand({
      Entries: [
        {
          Source: "orders.service",
          DetailType: "OrderPlaced",
          Detail: JSON.stringify({ orderId: "order-1" }),
        },
      ],
    }),
  );

  await simAws.backgroundTasksComplete();
}

describe("EventBridge ECS target", () => {
  it("runs the task a matched event's target names", async () => {
    // Given a rule whose target runs a task definition with a bound container.
    const simAws = await simulationAllowedToRunTasks();
    let runs = 0;

    await boundTaskDefinition(simAws, () => {
      runs += 1;
    });
    await ruleRunningTask(simAws);

    // When an event the rule matches is put.
    await putOrderEvent(simAws);

    // Then the container ran, and the task is in ECS's own state rather than
    // in something the rule kept for itself.
    assertIdentical(runs, 1);

    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });

    assertArrayLength(tasks.taskArns ?? [], 1);
    assertArrayEmpty(simAws.eventBridge().deliveryFailures);
  });

  it("puts the target's container overrides in the container", async () => {
    // Given a target whose Input overrides the container's environment.
    const simAws = await simulationAllowedToRunTasks();
    let reportedFor = "";

    await boundTaskDefinition(simAws, () => {
      reportedFor = process.env["REPORT_DATE"] ?? "";
    }, [{ name: "REPORT_DATE", value: "yesterday" }]);
    await ruleRunningTask(simAws, {
      Input: JSON.stringify({
        containerOverrides: [
          {
            name: "app",
            environment: [{ name: "REPORT_DATE", value: "today" }],
          },
        ],
      }),
    });

    // When the rule matches.
    await putOrderEvent(simAws);

    // Then the override reached the container, over the top of what the
    // container definition declared.
    assertIdentical(reportedFor, "today");
  });

  it("runs the number of tasks the target asked for", async () => {
    // Given a target asking for three tasks.
    const simAws = await simulationAllowedToRunTasks();

    await boundTaskDefinition(simAws, () => {
      //
    });
    await ruleRunningTask(simAws, { TaskCount: 3 });

    // When the rule matches.
    await putOrderEvent(simAws);

    // Then three tasks were started from the one event.
    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });

    assertArrayLength(tasks.taskArns ?? [], 3);
  });

  it("does not run the task when the role may not, and says why", async () => {
    // Given a role that trusts EventBridge and may run something else.
    const simAws = await simulationWithRole({
      Effect: "Allow",
      Action: "ecs:RunTask",
      Resource: "arn:aws:ecs:us-east-1:888888888888:task-definition/other:1",
    });
    let runs = 0;

    await boundTaskDefinition(simAws, () => {
      runs += 1;
    });
    await ruleRunningTask(simAws);

    // When the rule matches.
    await putOrderEvent(simAws);

    // Then nothing ran, and the failure names the action, since that is where
    // it is fixed.
    assertIdentical(runs, 0);

    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "ecs:RunTask");
    assertIdentical(failure.targetArn, clusterArn);
  });

  it("does not run the task when the role does not trust EventBridge", async () => {
    // Given a role trusting Scheduler rather than rules, which is an easy
    // thing to get wrong when moving from one to the other.
    const simAws = await simulationWithRole(
      { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
      "scheduler.amazonaws.com",
    );

    await boundTaskDefinition(simAws, () => {
      //
    });
    await ruleRunningTask(simAws);

    await putOrderEvent(simAws);

    // Then the failure points at the trust policy rather than the permission,
    // because that is the one to change.
    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "trust policy");
    assertStringIncludes(failure.message, "AssumeRolePolicyDocument");
  });

  it("reports a role that is not there rather than failing silently", async () => {
    // Given a simulation with a cluster and no role at all.
    const simAws = new SimAws();

    await simEcsClusterFactory.make({}, simAws);
    await boundTaskDefinition(simAws, () => {
      //
    });
    await ruleRunningTask(simAws);

    await putOrderEvent(simAws);

    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "is not a simulated IAM role");
  });

  it("records that no container ran rather than failing the rule", async () => {
    // Given a task definition whose container is bound to nothing, which is
    // every container Yulin cannot run.
    const simAws = await simulationAllowedToRunTasks();

    await simAws.ecs().registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "nightly-import",
        containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
      }),
    );
    await ruleRunningTask(simAws);

    // When the rule matches.
    await putOrderEvent(simAws);

    // Then the delivery was made, and the task says nothing started.
    assertArrayEmpty(simAws.eventBridge().deliveryFailures);

    const tasks = await simAws
      .ecs()
      .listTasks({ input: { desiredStatus: "STOPPED" } });
    const described = await simAws
      .ecs()
      .describeTasks({ input: { tasks: [...(tasks.taskArns ?? [])] } });

    const [task] = described.tasks ?? [];

    assertNonNullable(task);
    assertIdentical(task.stopCode, "TaskFailedToStart");
    assertStringIncludes(task.containers?.[0]?.reason ?? "", "no executable");
  });

  it("reports a cluster that is not there as a delivery failure", async () => {
    // Given a target naming a cluster nothing created.
    const simAws = await simulationAllowedToRunTasks();

    await boundTaskDefinition(simAws, () => {
      //
    });

    await simAws
      .eventBridge()
      .putRule(
        new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
      );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "orders",
        Targets: [
          {
            Id: "import",
            Arn: "arn:aws:ecs:us-east-1:888888888888:cluster/nightly",
            RoleArn: roleArn,
            EcsParameters: { TaskDefinitionArn: "nightly-import" },
          },
        ],
      }),
    );

    // When the rule matches.
    await putOrderEvent(simAws);

    // Then the failure says which cluster, rather than the rule looking as
    // though it delivered.
    const [failure] = simAws.eventBridge().deliveryFailures;

    assertNonNullable(failure);
    assertStringIncludes(failure.message, "nightly");
  });
});
