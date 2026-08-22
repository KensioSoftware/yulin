import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "../command/execution/execution.command.js";
import { SimStatesLambdaInvokeTarget } from "./sim-states-lambda-invoke-target.js";

describe("What a Task state answers with", () => {
  /**
   * Run a state machine of one task and read back how the execution ended.
   */
  async function runTask(
    simAws: SimAws,
    roleArn: string,
    task: JSONObject,
  ): Promise<SimDescribeExecutionCommandOutput> {
    const stateMachineArn = await statesMachineFactory.make(
      { roleArn, startAt: "Check", states: { Check: task } },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });
  }

  it("carries null where a handler answers with nothing", async () => {
    // Given a function whose handler returns nothing, as one doing its work
    // for the side effect does.
    const simAws = new SimAws();
    const record = await statesTaskFunctionFactory.make(
      { functionName: "record-enrolment", handler: () => undefined },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution invokes it through its ARN.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: record.arn,
      End: true,
    });

    // Then the execution carries the null a real invocation would answer.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, "null");
  });

  it("fails a task whose handler answers with something that is not JSON", async () => {
    // Given a handler answering with an object that refers to itself.
    const simAws = new SimAws();
    const check = await statesTaskFunctionFactory.make(
      {
        handler: () => {
          const answer: Record<string, unknown> = {};
          answer["itself"] = answer;

          return answer;
        },
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: check.arn,
      End: true,
    });

    // Then the task failed rather than the walk raising.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "not JSON");
  });

  it("refuses an Invoke request that names no function at all", () => {
    // Given requests the definition parser would never have let through, to
    // reach the integration's own guards.
    const target = new SimStatesLambdaInvokeTarget();

    // When the state's Parameters built something that is not a request.
    // Then it says what an invocation needs.
    assertStringIncludes(
      assertThrowsError(() => target.call("check-enrolment", "Check")).message,
      "built no Invoke request",
    );
    assertStringIncludes(
      assertThrowsError(() => target.call({ FunctionName: 3 }, "Check"))
        .message,
      "not the name or ARN of a function",
    );
  });
});
