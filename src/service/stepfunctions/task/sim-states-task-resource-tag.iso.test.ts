import { TagResourceCommand } from "@aws-sdk/client-lambda";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../../test/stepfunctions/states-task-function.factory.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * How an execution of a one-state machine invoking a function ended.
 */
async function statusInvoking(
  simAws: SimAws,
  roleArn: string,
  functionName: string,
): Promise<string> {
  const stateMachineArn = await statesMachineFactory.make(
    {
      name: functionName,
      roleArn,
      startAt: "Check",
      states: {
        Check: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: { FunctionName: functionName },
          End: true,
        },
      },
    },
    simAws,
  );
  const { executionArn } = await simAws
    .stepFunctions()
    .startExecution({ input: { stateMachineArn, input: "{}" } });
  const described = await simAws
    .stepFunctions()
    .describeExecution({ input: { executionArn } });

  return described.status;
}

describe("a Step Functions task decided on the tags of the function it invokes", () => {
  it("invokes only the functions the execution role's tag condition admits", async () => {
    // Given two functions, one tagged for the enrolment team.
    const simAws = new SimAws();
    for (const functionName of ["check-enrolment", "check-billing"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await statesTaskFunctionFactory.make(
        { functionName, handler: () => ({ checked: true }) },
        simAws,
      );
    }
    const enrolment = simAws.lambda().getSimFunctionByName("check-enrolment");
    await simAws.lambda().tagResource(
      new TagResourceCommand({
        Resource: enrolment?.arn,
        Tags: { team: "enrolment" },
      }),
    );

    // And an execution role allowed to invoke that team's functions alone.
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          {
            Effect: "Allow",
            Action: "lambda:InvokeFunction",
            Resource: "*",
            Condition: {
              StringEquals: { "aws:ResourceTag/team": "enrolment" },
            },
          },
        ],
      },
      simAws,
    );

    // When a state machine invokes each function.
    const enrolled = await statusInvoking(simAws, roleArn, "check-enrolment");
    const billed = await statusInvoking(simAws, roleArn, "check-billing");

    // Then only the tagged function's execution succeeded.
    assertIdentical(enrolled, "SUCCEEDED");
    assertIdentical(billed, "FAILED");
  });
});
