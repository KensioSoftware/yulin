import {
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  type Target,
} from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";
import { SimEventBridgeAccessDeniedException } from "../../error/sim-event-bridge.error.js";

const clusterArn = "arn:aws:ecs:us-east-1:888888888888:cluster/orders";

const eventsRoleArn = "arn:aws:iam::888888888888:role/EventsRole";

const orderPattern = JSON.stringify({ source: ["orders.service"] });

/**
 * The ECS target these tests add, which is the one kind of target this
 * simulation reads a `RoleArn` from.
 */
const importTarget: Target = {
  Id: "import",
  Arn: clusterArn,
  RoleArn: eventsRoleArn,
  EcsParameters: { TaskDefinitionArn: "nightly", TaskCount: 1 },
};

/**
 * A simulation holding a rule, and a Role allowed to put targets on it.
 */
async function simulationWithRule(): Promise<{
  simAws: SimAws;
  wirerArn: string;
}> {
  const simAws = new SimAws();

  await simAws
    .eventBridge()
    .putRule(
      new PutRuleCommand({ Name: "orders", EventPattern: orderPattern }),
    );

  const wirer = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "Wirer",
      policyName: "WireTargets",
      actions: ["events:PutTargets"],
    },
    simAws,
  );

  return { simAws, wirerArn: wirer.Arn };
}

describe("passing a target role to EventBridge PutTargets", () => {
  it("refuses a caller that may add targets and may not pass the role", async () => {
    // Given a Role allowed to add targets and nothing else.
    const { simAws, wirerArn } = await simulationWithRule();

    // When it adds a target carrying a role.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .eventBridge()
        .putTargets(
          new PutTargetsCommand({ Rule: "orders", Targets: [importTarget] }),
          { caller: { kind: "arn", arn: wirerArn } },
        ),
    );

    // Then EventBridge reports its own AccessDeniedException about the role
    // the rule would have run the target as.
    assertInstanceOf(error, SimEventBridgeAccessDeniedException);
    assertStringIncludes(error.message, "iam:PassRole");
    assertStringIncludes(error.message, eventsRoleArn);
    assertStringIncludes(error.message, wirerArn);

    // And no target was added.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));

    assertArrayLength(listed.Targets, 0);
  });

  it("adds the target for a caller allowed to pass a role to EventBridge", async () => {
    // Given the same Role, also allowed to pass a role to events.
    const { simAws, wirerArn } = await simulationWithRule();

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Wirer",
        PolicyName: "PassEventsRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: eventsRoleArn,
            Condition: {
              StringEquals: { "iam:PassedToService": "events.amazonaws.com" },
            },
          },
        }),
      },
    });

    // When it adds the target.
    await simAws
      .eventBridge()
      .putTargets(
        new PutTargetsCommand({ Rule: "orders", Targets: [importTarget] }),
        { caller: { kind: "arn", arn: wirerArn } },
      );

    // Then the condition matched and the rule holds the target.
    const listed = await simAws
      .eventBridge()
      .listTargetsByRule(new ListTargetsByRuleCommand({ Rule: "orders" }));

    assertArrayLength(listed.Targets, 1);
  });
});
