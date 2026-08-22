import {
  assertArrayEquals,
  assertIdentical,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import type { SimStepFunctions } from "./sim-step-functions.js";

/**
 * Create a state machine from a definition written as an object.
 */
async function givenAStateMachine(
  stepFunctions: SimStepFunctions,
  states: object,
  startAt: string,
): Promise<string> {
  const created = await stepFunctions.createStateMachine({
    input: {
      name: "Enrolment",
      roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
      definition: JSON.stringify({ StartAt: startAt, States: states }),
    },
  });

  return created.stateMachineArn;
}

describe("Simulated Step Functions executions", () => {
  it("runs a Pass state machine to SUCCEEDED before the caller reads it", async () => {
    // Given a state machine of one Pass state.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Pass", End: true } },
      "Only",
    );

    // When an execution is started and read straight back.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"term":3}' } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it has already finished, carrying its input through.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"term":3}');
  });

  it("moves through the states its transitions name, in order", async () => {
    // Given a state machine of three states in a chain.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      {
        First: { Type: "Pass", Result: { step: 1 }, Next: "Second" },
        Second: { Type: "Pass", ResultPath: "$.checked", Next: "Done" },
        Done: { Type: "Succeed" },
      },
      "First",
    );

    // When an execution runs.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    // Then every state was entered, in the order the chain names.
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["First", "Second", "Done"],
    );
  });

  it("carries a Pass state's Result through its ResultPath", async () => {
    // Given a Pass state writing a literal into its input.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      {
        Only: {
          Type: "Pass",
          Result: { eligible: true },
          ResultPath: "$.check",
          End: true,
        },
      },
      "Only",
    );

    // When an execution runs with an input.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Wei"}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the result sits alongside the input it was given.
    assertObjectEquals(JSON.parse(described.output ?? "null"), {
      student: "Wei",
      check: { eligible: true },
    });
  });

  it("ends an execution at a Fail state with the error it names", async () => {
    // Given a state machine that fails.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      {
        Only: { Type: "Fail", Error: "NotEligible", Cause: "No place left" },
      },
      "Only",
    );

    // When an execution runs.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the failure is recorded on the execution rather than raised.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "NotEligible");
    assertIdentical(described.cause, "No place left");
  });

  it("records a data-flow failure with its Amazon States Language error name", async () => {
    // Given a state reading a path its input has nothing at.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Pass", InputPath: "$.absent", End: true } },
      "Only",
    );

    // When an execution runs.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: "{}" } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution failed with the name a Catch would match on.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.ParameterPathFailure");
  });

  it("narrows a Succeed state's output with its OutputPath", async () => {
    // Given a Succeed state reading one field.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Succeed", OutputPath: "$.student" } },
      "Only",
    );

    // When an execution runs.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Wei","term":3}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then only the narrowed value comes out.
    assertIdentical(described.output, '"Wei"');
  });

  it("gives an execution an empty object where the request carried no input", async () => {
    // Given a state machine passing its input through.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Pass", End: true } },
      "Only",
    );

    // When an execution is started with nothing.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it ran on an empty object.
    assertIdentical(described.input, "{}");
    assertIdentical(described.output, "{}");
  });
});

describe("Simulated Step Functions execution inspection", () => {
  it("lists a state machine's executions, most recently started first", async () => {
    // Given a state machine that has run twice.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Pass", End: true } },
      "Only",
    );
    const first = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, name: "first" } });
    const second = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, name: "second" } });

    // When its executions are listed.
    const listed = simAws
      .stepFunctions()
      .inspection()
      .executionsOf(stateMachineArn);

    // Then the most recent comes first.
    assertArrayEquals(listed, [second.executionArn, first.executionArn]);
  });

  it("reports nothing for an execution it has never run", () => {
    // Given a simulated Step Functions holding nothing.
    const simAws = new SimAws();

    // When an unknown execution's states are asked for.
    const visited = simAws
      .stepFunctions()
      .inspection()
      .visitedStates("arn:aws:states:eu-west-2:123456789012:execution:A:one");

    // Then it reports nothing rather than raising.
    assertArrayEquals(visited, []);
  });

  it("reads back a definition's Comment", async () => {
    // Given a state machine whose definition carries a comment.
    const simAws = new SimAws();
    const created = await simAws.stepFunctions().createStateMachine({
      input: {
        name: "Commented",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition: JSON.stringify({
          Comment: "Enrols a student",
          StartAt: "Only",
          States: { Only: { Type: "Succeed" } },
        }),
      },
    });

    // When an execution runs.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn: created.stateMachineArn },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the comment changed nothing about the run.
    assertIdentical(described.status, "SUCCEEDED");
  });

  it("ends a Fail state with no Error under a states name of its own", async () => {
    // Given a Fail state naming no error.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      { Only: { Type: "Fail" } },
      "Only",
    );

    // When an execution runs.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it carries the unnamed default and no cause.
    assertIdentical(described.error, "States.Unknown");
    assertUndefined(described.cause);
  });
});
