import { faker } from "@faker-js/faker";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../../test/stepfunctions/states-task-function.factory.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Step Functions execution role source conditions", () => {
  it.each(["matching", "wrong account", "wrong state machine"])(
    "evaluates a trust policy with %s source conditions",
    async (condition) => {
      // Given a workflow whose role restricts which state machine may assume it.
      // https://docs.aws.amazon.com/step-functions/latest/dg/procedure-create-iam-role.html
      const simAws = new SimAws();
      const check = await statesTaskFunctionFactory.make({}, simAws);
      const roleName = `Workflow-${faker.string.uuid()}`;
      const roleAccount = simAws.account().accountId;
      const roleArn = `arn:aws:iam::${roleAccount}:role/${roleName}`;
      const stateMachineArn = await statesMachineFactory.make(
        {
          name: `Workflow-${faker.string.uuid()}`,
          roleArn,
          states: { Check: { Type: "Task", Resource: check.arn, End: true } },
        },
        simAws,
      );
      let sourceArn = stateMachineArn;
      let sourceAccount: string = simAws.account().accountId;
      if (condition === "wrong account") {
        sourceAccount = "222222222222";
      } else if (condition === "wrong state machine") {
        sourceArn = `${stateMachineArn}-other`;
      }
      await statesExecutionRoleFactory.make(
        {
          roleName,
          trustConditions: {
            ArnLike: { "aws:SourceArn": sourceArn },
            StringEquals: { "aws:SourceAccount": sourceAccount },
          },
        },
        simAws,
      );

      // When the workflow invokes its task through the execution role.
      const started = await simAws.stepFunctions().startExecution({
        input: { stateMachineArn, input: '{"student":"Wei"}' },
      });
      const execution = await simAws.stepFunctions().describeExecution({
        input: { executionArn: started.executionArn },
      });

      // Then only the matching state machine and source account are admitted.
      if (condition === "matching") {
        assertIdentical(execution.status, "SUCCEEDED", execution.cause);
        assertIdentical(execution.output, '{"student":"Wei"}');
      } else {
        assertIdentical(execution.status, "FAILED");
        assertIdentical(execution.error, "States.TaskFailed");
        assertStringIncludes(execution.cause ?? "", "AssumeRolePolicyDocument");
      }
    },
  );
});
