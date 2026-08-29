import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

const workflowRoleArn = "arn:aws:iam::888888888888:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

describe("passing a role to Step Functions CreateStateMachine", () => {
  it("refuses a caller that may create and may not pass the role", async () => {
    // Given a Role allowed to make state machines and nothing else.
    const simAws = new SimAws();
    const creator = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Creator",
        policyName: "CreateWorkflows",
        actions: ["states:CreateStateMachine"],
      },
      simAws,
    );

    // When it creates a state machine naming a role to run as.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.stepFunctions().createStateMachine(
        {
          input: {
            name: "Enrolment",
            roleArn: workflowRoleArn,
            definition: passThrough,
          },
        },
        { caller: { kind: "arn", arn: creator.Arn } },
      ),
    );

    // Then the refusal is about the role it was handing over.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "iam:PassRole");
    assertIdentical(error.resource, workflowRoleArn);
    assertStringIncludes(error.message, creator.Arn);
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));
  });

  it("creates for a caller allowed to pass a role to Step Functions", async () => {
    // Given the same Role, also allowed to pass a role to states.
    const simAws = new SimAws();
    const creator = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Creator",
        policyName: "CreateWorkflows",
        actions: ["states:CreateStateMachine"],
      },
      simAws,
    );

    await simAws.iam().putRolePolicy({
      input: {
        RoleName: "Creator",
        PolicyName: "PassWorkflowRole",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: {
            Action: "iam:PassRole",
            Resource: workflowRoleArn,
            Condition: {
              StringEquals: { "iam:PassedToService": "states.amazonaws.com" },
            },
          },
        }),
      },
    });

    // When it creates the state machine.
    const created = await simAws.stepFunctions().createStateMachine(
      {
        input: {
          name: "Enrolment",
          roleArn: workflowRoleArn,
          definition: passThrough,
        },
      },
      { caller: { kind: "arn", arn: creator.Arn } },
    );

    // Then the condition matched and the state machine is there.
    assertStringIncludes(created.stateMachineArn, "stateMachine:Enrolment");
  });
});
