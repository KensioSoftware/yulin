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
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simEcsClusterFactory } from "../../ecs/cluster/sim-ecs-cluster.factory.js";

const clusterArn = "arn:aws:ecs:us-east-1:888888888888:cluster/default";

const roleArn = "arn:aws:iam::888888888888:role/EventsRole";

const ruleArn = "arn:aws:events:us-east-1:888888888888:rule/orders";

/**
 * A simulation with a cluster, and a role that trusts EventBridge under the
 * condition given and may run any task.
 *
 * The condition is what each test here varies. Everything else matches the
 * arrangement the other ECS target tests use.
 */
async function simulationWithTrustCondition(
  condition: object | undefined,
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
          Principal: { Service: "events.amazonaws.com" },
          Action: "sts:AssumeRole",
          ...(condition !== undefined && { Condition: condition }),
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
        Statement: { Effect: "Allow", Action: "ecs:RunTask", Resource: "*" },
      }),
    }),
  );

  return simAws;
}

/**
 * The confused deputy condition AWS documents for a rule's role, written the
 * way its own example writes it.
 */
function sourceCondition(arn: string): object {
  return {
    ArnLike: { "aws:SourceArn": arn },
    StringEquals: { "aws:SourceAccount": "888888888888" },
  };
}

/**
 * A rule with an ECS target on it, and a container bound to count its runs.
 */
async function ruleRunningTask(simAws: SimAws): Promise<() => number> {
  let runs = 0;

  simAws.ecs().bindContainer({
    family: "nightly-import",
    containerName: "app",
    run: () => {
      runs += 1;
    },
  });

  await simAws.ecs().registerTaskDefinition(
    new RegisterTaskDefinitionCommand({
      family: "nightly-import",
      containerDefinitions: [{ name: "app", image: "nightly-import:1" }],
    }),
  );

  await simAws.eventBridge().putRule(
    new PutRuleCommand({
      Name: "orders",
      EventPattern: JSON.stringify({ source: ["orders.service"] }),
    }),
  );

  await simAws.eventBridge().putTargets(
    new PutTargetsCommand({
      Rule: "orders",
      Targets: [
        {
          Id: "import",
          Arn: clusterArn,
          RoleArn: roleArn,
          EcsParameters: { TaskDefinitionArn: "nightly-import" },
        },
      ],
    }),
  );

  return () => runs;
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

describe("EventBridge target role source", () => {
  it("assumes a role scoped to the rule's ARN", async () => {
    // Given a role carrying the confused deputy condition AWS documents for a
    // role a rule uses.
    const simAws = await simulationWithTrustCondition(sourceCondition(ruleArn));
    const runs = await ruleRunningTask(simAws);

    // When an event the rule matches is put.
    await putOrderEvent(simAws);

    // Then the task ran. The rule's ARN and Account were supplied, so the
    // condition matched.
    assertIdentical(runs(), 1);
    assertArrayEmpty(simAws.eventBridge().deliveryFailures);
  });

  it("refuses a role scoped to a different rule's ARN", async () => {
    // Given a role scoped to some other rule.
    const simAws = await simulationWithTrustCondition(
      sourceCondition("arn:aws:events:us-east-1:888888888888:rule/refunds"),
    );
    const runs = await ruleRunningTask(simAws);

    // When an event this rule matches is put.
    await putOrderEvent(simAws);

    // Then no task ran and the delivery is a recorded failure.
    assertIdentical(runs(), 0);
    assertArrayLength(simAws.eventBridge().deliveryFailures, 1);
    assertStringIncludes(
      String(simAws.eventBridge().deliveryFailures[0]?.error),
      "does not allow events.amazonaws.com to assume it",
    );
  });

  it("assumes a role whose trust policy carries no condition", async () => {
    // Given a role that trusts EventBridge unconditionally.
    const simAws = await simulationWithTrustCondition(undefined);
    const runs = await ruleRunningTask(simAws);

    // When an event the rule matches is put.
    await putOrderEvent(simAws);

    // Then the task ran. Supplying the keys does not require them to be used.
    assertIdentical(runs(), 1);
  });
});
