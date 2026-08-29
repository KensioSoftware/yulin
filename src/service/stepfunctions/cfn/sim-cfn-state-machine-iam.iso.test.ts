import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

const executionRoleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

const passChain = {
  StartAt: "Record",
  States: {
    Record: { Type: "Pass", Result: { enrolled: true }, Next: "Done" },
    Done: { Type: "Succeed" },
  },
};

const workflowTemplate = {
  Resources: {
    Workflow: {
      Type: "AWS::StepFunctions::StateMachine",
      Properties: {
        StateMachineName: "Enrolment",
        RoleArn: executionRoleArn,
        DefinitionString: JSON.stringify(passChain),
      },
    },
  },
};

/**
 * Deploy a Stack holding one state machine, as the caller it is given.
 */
async function deployAsCaller(
  simAws: SimAws,
  caller: SimAwsCaller,
): Promise<SimCfnDeployedStack> {
  return await simAws.cloudFormation().deployTemplate({
    stackName: "enrolment",
    template: workflowTemplate,
    caller,
  });
}

/**
 * A Role allowed the actions it is given, as a caller a deployment can name.
 */
async function roleAllowing(
  simAws: SimAws,
  roleName: string,
  actions: readonly string[],
): Promise<SimAwsCaller> {
  const role = await simIamRoleWithPolicyFactory.make(
    { roleName, actions },
    simAws,
  );

  return { kind: "arn", arn: role.Arn };
}

describe("the principal an AWS::StepFunctions::StateMachine Resource is created as", () => {
  it("fails the Resource under a caller that may not create state machines", async () => {
    // Given a Role that may start executions and not make the machine that
    // runs them.
    const simAws = new SimAws();
    const starter = await roleAllowing(simAws, "Starter", [
      "states:StartExecution",
    ]);

    // When a Stack declaring a state machine is deployed as it.
    const error = await assertThrowsErrorAsync(
      async () => await deployAsCaller(simAws, starter),
    );

    // Then the deploy is refused by name, and no state machine was made
    // behind the refusal.
    assertStringIncludes(error.message, "states:CreateStateMachine");
    assertStringIncludes(error.message, "role/Starter");
    assertUndefined(simAws.stepFunctions().findStateMachine("Enrolment"));
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("enrolment")
        ?.getResource("Workflow")?.status,
      "CREATE_FAILED",
    );
  });

  it("creates the state machine under a caller allowed the creation", async () => {
    // Given a Role allowed to make state machines, and to pass the Role each
    // one runs as.
    const simAws = new SimAws();
    const deployer = await roleAllowing(simAws, "Deployer", [
      "states:CreateStateMachine",
      "iam:PassRole",
    ]);

    // When it deploys the Stack.
    await deployAsCaller(simAws, deployer);

    // Then simulated Step Functions holds the state machine the template
    // declared.
    assertNonNullable(simAws.stepFunctions().findStateMachine("Enrolment"));
  });

  it("tears the state machine down as the principal the Stack was deployed as", async () => {
    // Given a Stack deployed by a Role that may make a state machine and not
    // remove one.
    const simAws = new SimAws();
    const maker = await roleAllowing(simAws, "Maker", [
      "states:CreateStateMachine",
      "iam:PassRole",
    ]);
    const stack = await deployAsCaller(simAws, maker);

    // When the Stack is torn down.
    const error = await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the deletion was refused by name, and the state machine is where
    // it was.
    assertStringIncludes(error.message, "states:DeleteStateMachine");
    assertNonNullable(simAws.stepFunctions().findStateMachine("Enrolment"));
  });
});
