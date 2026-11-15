import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimIamPolicyDocumentCondition } from "../../../iam/policy/sim-iam-policy.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

const workflowRoleArn = "arn:aws:iam::888888888888:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

/**
 * A caller allowed the actions given under the condition given, and allowed
 * to pass the workflow role whatever the request carries.
 */
async function callerAllowed(
  simAws: SimAws,
  actions: readonly string[],
  condition?: SimIamPolicyDocumentCondition,
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName: "Creator", actions, condition },
    simAws,
  );

  await simAws.iam().putRolePolicy({
    input: {
      RoleName: "Creator",
      PolicyName: "PassWorkflowRole",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "iam:PassRole", Resource: workflowRoleArn },
      }),
    },
  });

  return { kind: "arn", arn: role.Arn };
}

/**
 * Create a state machine carrying the tags given, as the caller given.
 */
async function create(
  simAws: SimAws,
  name: string,
  tags: readonly { key: string; value: string }[],
  caller?: SimAwsCaller,
): Promise<string> {
  const created = await simAws.stepFunctions().createStateMachine(
    {
      input: {
        name,
        roleArn: workflowRoleArn,
        definition: passThrough,
        tags,
      },
    },
    caller === undefined ? {} : { caller },
  );

  return created.stateMachineArn;
}

describe("sim Step Functions request tags", () => {
  it("needs states:TagResource to create a state machine with tags", async () => {
    // Given a caller allowed to create state machines and pass their role
    const simAws = new SimAws();
    const caller = await callerAllowed(simAws, ["states:CreateStateMachine"]);

    // When it creates an untagged state machine and a tagged one
    await create(simAws, "Plain", [], caller);
    const error = await assertThrowsErrorAsync(async () =>
      create(simAws, "Tagged", [{ key: "team", value: "orders" }], caller),
    );

    // Then only the tagged one is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.stepFunctions().findStateMachine("Plain"));
    assertUndefined(simAws.stepFunctions().findStateMachine("Tagged"));
  });

  it("lets a policy decide CreateStateMachine on the tags it carries", async () => {
    // Given a caller allowed to create and tag state machines tagged for its
    // own team
    const simAws = new SimAws();
    const caller = await callerAllowed(
      simAws,
      ["states:CreateStateMachine", "states:TagResource"],
      { StringEquals: { "aws:RequestTag/team": "orders" } },
    );

    // When it creates one for its own team and one for another
    await create(simAws, "Orders", [{ key: "team", value: "orders" }], caller);
    const error = await assertThrowsErrorAsync(async () =>
      create(simAws, "Billing", [{ key: "team", value: "billing" }], caller),
    );

    // Then only its own team's state machine is made
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.stepFunctions().findStateMachine("Orders"));
    assertUndefined(simAws.stepFunctions().findStateMachine("Billing"));
  });

  it("gives IAM the keys TagResource and UntagResource name", async () => {
    // Given a state machine, and a caller allowed to tag and untag only the
    // cost key
    const simAws = new SimAws();
    const resourceArn = await create(simAws, "Orders", []);
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["states:TagResource", "states:UntagResource"],
        condition: { "ForAllValues:StringEquals": { "aws:TagKeys": ["cost"] } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it sets and removes the cost key, then tries the team key
    await simAws
      .stepFunctions()
      .tagResource(
        { input: { resourceArn, tags: [{ key: "cost", value: "42" }] } },
        { caller },
      );
    await simAws
      .stepFunctions()
      .untagResource({ input: { resourceArn, tagKeys: ["cost"] } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .stepFunctions()
        .untagResource(
          { input: { resourceArn, tagKeys: ["team"] } },
          { caller },
        ),
    );

    // Then only the team key is refused
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
