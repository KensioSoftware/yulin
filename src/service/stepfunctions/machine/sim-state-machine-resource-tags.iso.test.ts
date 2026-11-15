import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create a one-state machine tagged for the team given.
 */
async function taggedMachine(
  simAws: SimAws,
  name: string,
  team: string,
): Promise<string> {
  const roleArn = await statesExecutionRoleFactory.make(
    { roleName: `${name}Role` },
    simAws,
  );
  const stateMachineArn = await statesMachineFactory.make(
    {
      name,
      roleArn,
      startAt: "Done",
      states: { Done: { Type: "Pass", End: true } },
    },
    simAws,
  );
  await simAws.stepFunctions().tagResource({
    input: {
      resourceArn: stateMachineArn,
      tags: [{ key: "team", value: team }],
    },
  });

  return stateMachineArn;
}

describe("a sim state machine's tags in IAM", () => {
  it("lets a policy decide StartExecution on the tags of the state machine", async () => {
    // Given two state machines tagged for different teams, and a caller
    // allowed to start those tagged for its own
    const simAws = new SimAws();
    const orders = await taggedMachine(simAws, "Orders", "orders");
    const billing = await taggedMachine(simAws, "Billing", "billing");
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["states:StartExecution"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it starts each
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn: orders } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .stepFunctions()
        .startExecution({ input: { stateMachineArn: billing } }, { caller }),
    );

    // Then only its own team's state machine runs
    assertStringIncludes(started.executionArn, ":execution:Orders:");
    assertInstanceOf(error, SimIamAccessDenied);
  });

  it("refuses a tag change to a caller IAM does not allow it", async () => {
    // Given a state machine, and a caller allowed only to describe it
    const simAws = new SimAws();
    const orders = await taggedMachine(simAws, "Orders", "orders");
    const role = await simIamRoleWithPolicyFactory.make(
      { actions: ["states:DescribeStateMachine"] },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it changes the state machine's tags
    const error = await assertThrowsErrorAsync(async () =>
      simAws.stepFunctions().tagResource(
        {
          input: {
            resourceArn: orders,
            tags: [{ key: "team", value: "billing" }],
          },
        },
        { caller },
      ),
    );

    // Then IAM refuses it
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
