import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../../test/stepfunctions/states-machine.factory.js";
import { runSimStatesTaskState } from "../../../../../test/stepfunctions/states-task-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { JSONObject } from "../../../../util/type-guard/json.js";

describe("A Task state starting another state machine", () => {
  it("answers with the execution it started", async () => {
    // Given a state machine that records what it was started with.
    const simAws = new SimAws();
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const recording = await statesMachineFactory.make(
      {
        name: "Recording",
        roleArn,
        startAt: "Record",
        states: {
          Record: { Type: "Pass", ResultPath: "$.recorded", End: true },
        },
      },
      simAws,
    );

    // When a task starts it, with an Input written as JSON.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::states:startExecution",
        Parameters: {
          StateMachineArn: recording,
          Input: { "student.$": "$.student" },
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then the task's result is the execution that started.
    assertIdentical(described.status, "SUCCEEDED");

    const output = JSON.parse(described.output ?? "{}") as JSONObject;
    const executionArn = output["ExecutionArn"];

    assertTypeString(executionArn);
    assertStringIncludes(executionArn, ":execution:Recording:");
    assertNonNullable(output["StartDate"], "The answer carries a StartDate");

    // And the execution it started ran on the input the task built.
    const inner = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(inner.status, "SUCCEEDED");
    assertIdentical(inner.input, '{"student":"Wei"}');
  });
});
