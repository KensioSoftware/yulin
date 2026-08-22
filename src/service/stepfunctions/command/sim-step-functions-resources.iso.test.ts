import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const roleArn = "arn:aws:iam::123456789012:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

const absentArn = "arn:aws:states:eu-west-2:123456789012:stateMachine:Absent";

/**
 * Answer with why a call was refused.
 */
async function refusalFor(call: () => Promise<unknown>): Promise<string> {
  const error = await assertThrowsErrorAsync(call);

  return error.message;
}

describe("Simulated Step Functions resource handling", () => {
  it("accepts an EXPRESS state machine and runs it the standard way", async () => {
    // Given an EXPRESS state machine.
    const simAws = new SimAws();
    const created = await simAws.stepFunctions().createStateMachine({
      input: {
        name: "Enrolment",
        roleArn,
        definition: passThrough,
        type: "EXPRESS",
      },
    });

    // When it is read back.
    const described = await simAws.stepFunctions().describeStateMachine({
      input: { stateMachineArn: created.stateMachineArn },
    });

    // Then the type is carried, and nothing else about it differs here.
    assertStringIncludes(described.type, "EXPRESS");
  });

  it("refuses a request carrying no ARN, and one naming nothing", async () => {
    // Given a simulated Step Functions holding nothing.
    const simAws = new SimAws();
    const stepFunctions = simAws.stepFunctions();

    // When commands are called without an ARN and with an absent one.
    const noArn = await refusalFor(
      async () => await stepFunctions.describeStateMachine({ input: {} }),
    );
    const absent = await refusalFor(
      async () =>
        await stepFunctions.deleteStateMachine({
          input: { stateMachineArn: absentArn },
        }),
    );
    const noStart = await refusalFor(
      async () => await stepFunctions.startExecution({ input: {} }),
    );
    const absentStart = await refusalFor(
      async () =>
        await stepFunctions.startExecution({
          input: { stateMachineArn: absentArn },
        }),
    );
    const noExecution = await refusalFor(
      async () => await stepFunctions.describeExecution({ input: {} }),
    );

    // Then each says what was wrong with the request.
    assertStringIncludes(noArn, "needs a stateMachineArn");
    assertStringIncludes(absent, "not a simulated state machine");
    assertStringIncludes(noStart, "StartExecution needs a stateMachineArn");
    assertStringIncludes(absentStart, "not a simulated state machine");
    assertStringIncludes(noExecution, "needs an executionArn");
  });

  it("refuses an update naming a state machine that is not there", async () => {
    // Given a simulated Step Functions holding nothing.
    const simAws = new SimAws();

    // When an absent state machine is given a new role.
    const refusal = await refusalFor(
      async () =>
        await simAws.stepFunctions().updateStateMachine({
          input: { stateMachineArn: absentArn, roleArn },
        }),
    );

    // Then it is refused.
    assertStringIncludes(refusal, "not a simulated state machine");
  });

  it("steps a generated execution name over one a caller has used", async () => {
    // Given a state machine whose first execution was named execution-1.
    const simAws = new SimAws();
    const created = await simAws.stepFunctions().createStateMachine({
      input: { name: "Enrolment", roleArn, definition: passThrough },
    });
    const stateMachineArn = created.stateMachineArn;

    await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, name: "execution-1" } });

    // When an unnamed execution is started.
    const unnamed = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    // Then it took the next free name rather than failing on one its caller
    // never wrote.
    assertStringIncludes(unnamed.executionArn, ":execution-2");
  });

  it("tells a missing execution apart from a missing state machine", async () => {
    // Given a simulated Step Functions holding nothing.
    const simAws = new SimAws();

    // When each absent resource is asked for.
    const machine = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .stepFunctions()
          .describeStateMachine({ input: { stateMachineArn: absentArn } }),
    );
    const execution = await assertThrowsErrorAsync(
      async () =>
        await simAws.stepFunctions().describeExecution({
          input: {
            executionArn:
              "arn:aws:states:eu-west-2:123456789012:execution:Absent:one",
          },
        }),
    );

    // Then each carries the error name real Step Functions uses.
    assertIdentical(machine.name, "StateMachineDoesNotExist");
    assertIdentical(execution.name, "ExecutionDoesNotExist");
  });

  it("answers DescribeStateMachine with a creationDate a caller cannot move", async () => {
    // Given a state machine.
    const simAws = new SimAws();
    const created = await simAws.stepFunctions().createStateMachine({
      input: { name: "Enrolment", roleArn, definition: passThrough },
    });

    // When the date it answered with is moved.
    created.creationDate.setFullYear(1999);

    const described = await simAws.stepFunctions().describeStateMachine({
      input: { stateMachineArn: created.stateMachineArn },
    });

    // Then the state machine kept its own.
    assertFalse(described.creationDate.getFullYear() === 1999);
  });
});
