import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { JSONValue } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "./command/execution/execution.command.js";

describe("Simulated Step Functions Task states", () => {
  /**
   * Start an execution and read back how it ended.
   */
  async function runExecution(
    simAws: SimAws,
    stateMachineArn: string,
    input: JSONValue,
  ): Promise<SimDescribeExecutionCommandOutput> {
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: JSON.stringify(input) },
    });

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });
  }

  it("invokes a function through the Lambda integration", async () => {
    // Given a function answering what it was sent, and a state machine
    // invoking it the way CDK's LambdaInvoke writes one.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      { handler: (event: unknown) => ({ eligible: true, sent: event }) },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Check",
        states: {
          Check: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: {
              FunctionName: "check-enrolment",
              "Payload.$": "$",
            },
            End: true,
          },
        },
      },
      simAws,
    );

    // When an execution runs.
    const described = await runExecution(simAws, stateMachineArn, {
      student: "Wei",
    });

    // Then the handler was sent what Parameters built, and the state answered
    // with the Invoke response around what the handler answered.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.output,
      '{"ExecutedVersion":"$LATEST","Payload":{"eligible":true,' +
        '"sent":{"student":"Wei"}},"StatusCode":200}',
    );
  });

  it("invokes a function through its own ARN, with nothing around the answer", async () => {
    // Given a state machine whose Resource is the function ARN, which is what
    // CDK writes for payloadResponseOnly.
    const simAws = new SimAws();
    const enrol = await statesTaskFunctionFactory.make(
      {
        functionName: "enrol-student",
        handler: (event: { student: string }) => ({
          enrolled: event.student,
        }),
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Enrol",
        states: { Enrol: { Type: "Task", Resource: enrol.arn, End: true } },
      },
      simAws,
    );

    // When an execution runs.
    const described = await runExecution(simAws, stateMachineArn, {
      student: "Wei",
    });

    // Then the state's own input reached the handler, and what the handler
    // answered is the execution's output.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"enrolled":"Wei"}');
  });

  it("shapes a task result with ResultSelector and ResultPath", async () => {
    // Given a task narrowing the Invoke response and writing it beside the
    // input it was given.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      { handler: () => ({ eligible: true, checkedBy: "admissions" }) },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Check",
        states: {
          Check: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
            ResultSelector: { "eligible.$": "$.Payload.eligible" },
            ResultPath: "$.outcome",
            Next: "Done",
          },
          Done: { Type: "Succeed" },
        },
      },
      simAws,
    );

    // When an execution runs.
    const described = await runExecution(simAws, stateMachineArn, {
      student: "Wei",
    });

    // Then the execution carries its input and the field the selector kept.
    assertIdentical(
      described.output,
      '{"student":"Wei","outcome":{"eligible":true}}',
    );
  });

  it("narrows what the next state receives with OutputPath", async () => {
    // Given a task whose result is written into the input and then narrowed
    // back down to the field the state after it works on.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      { handler: () => ({ eligible: true }) },
      simAws,
    );
    const enrol = await statesTaskFunctionFactory.make(
      {
        functionName: "enrol-student",
        handler: (event: unknown) => ({ enrolled: event }),
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Check",
        states: {
          Check: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
            ResultPath: "$.outcome",
            OutputPath: "$.outcome.Payload",
            Next: "Enrol",
          },
          Enrol: { Type: "Task", Resource: enrol.arn, End: true },
        },
      },
      simAws,
    );

    // When an execution runs.
    const described = await runExecution(simAws, stateMachineArn, {
      student: "Wei",
    });

    // Then the second task was handed the narrowed value alone, with the
    // student the execution started with left behind.
    assertIdentical(described.output, '{"enrolled":{"eligible":true}}');
  });

  it("runs a handler on the same clock a later Wait reads", async () => {
    // Given a handler stamping the time, and a Wait holding the execution
    // until an hour after the stamp.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:00:00.000Z")),
    });
    const stamp = await statesTaskFunctionFactory.make(
      {
        functionName: "stamp-enrolment",
        handler: () => ({
          due: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Stamp",
        states: {
          Stamp: { Type: "Task", Resource: stamp.arn, Next: "Hold" },
          Hold: { Type: "Wait", TimestampPath: "$.due", Next: "Done" },
          Done: { Type: "Succeed" },
        },
      },
      simAws,
    );

    // When the execution runs and simulated time moves past the stamp.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const waiting = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    await simAws.clock().advanceBy({ hours: 2 });

    const settled = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the handler read the simulation's clock rather than the host's, so
    // the wait it stamped is an hour after the execution started.
    assertIdentical(waiting.status, "RUNNING");
    assertIdentical(settled.status, "SUCCEEDED");
    assertIdentical(
      settled.stopDate?.toISOString(),
      "2026-07-26T10:00:00.000Z",
    );
    assertNonNullable(settled.output, "The execution has an output");
  });

  it("visits the states of a workflow that branches on a task result", async () => {
    // Given the workflow the issue describes: a task, a choice on what it
    // answered, and a second task.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      { handler: () => ({ eligible: true }) },
      simAws,
    );
    const enrol = await statesTaskFunctionFactory.make(
      { functionName: "enrol-student", handler: () => ({ enrolled: true }) },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Check",
        states: {
          Check: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
            ResultSelector: { "eligible.$": "$.Payload.eligible" },
            Next: "Eligible",
          },
          Eligible: {
            Type: "Choice",
            Choices: [
              { Variable: "$.eligible", BooleanEquals: true, Next: "Enrol" },
            ],
            Default: "Decline",
          },
          Enrol: { Type: "Task", Resource: enrol.arn, End: true },
          Decline: { Type: "Fail", Error: "NotEligible" },
        },
      },
      simAws,
    );

    // When an execution runs.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Wei"}' },
    });

    // Then it took the branch the task's answer chose.
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["Check", "Eligible", "Enrol"],
    );
  });
});
