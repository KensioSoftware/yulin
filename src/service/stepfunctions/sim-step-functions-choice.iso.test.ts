import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../aws/sim-aws.js";
import type { SimStepFunctions } from "./sim-step-functions.js";

describe("Simulated Step Functions Choice states", () => {
  /**
   * Create a state machine from a definition written as an object.
   */
  async function givenAStateMachine(
    stepFunctions: SimStepFunctions,
    states: object,
  ): Promise<string> {
    const created = await stepFunctions.createStateMachine({
      input: {
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition: JSON.stringify({ StartAt: "Eligible", States: states }),
      },
    });

    return created.stateMachineArn;
  }

  /**
   * A state machine that branches on the term a student is in.
   */
  function branchingStates(fallback: object): object {
    return {
      Eligible: {
        Type: "Choice",
        Choices: [
          {
            And: [
              { Variable: "$.term", IsPresent: true },
              { Variable: "$.term", NumericGreaterThanEquals: 2 },
            ],
            Next: "Enrol",
          },
          { Variable: "$.student", StringEquals: "Wei", Next: "Enrol" },
        ],
        ...fallback,
      },
      Enrol: { Type: "Pass", Result: { enrolled: true }, End: true },
      Decline: { Type: "Fail", Error: "NotEligible" },
    };
  }

  it("takes the branch the first matching rule names", async () => {
    // Given a state machine branching on the term a student is in.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      branchingStates({ Default: "Decline" }),
    );

    // When an execution runs on an input the first rule matches.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Li","term":3}' },
    });

    // Then it went to the state that rule names.
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["Eligible", "Enrol"],
    );
  });

  it("takes a later rule where the earlier one does not match", async () => {
    // Given the same state machine, and a student in their first term.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      branchingStates({ Default: "Decline" }),
    );

    // When an execution runs on an input only the second rule matches.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Wei","term":1}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the second rule took it, and the execution succeeded.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"enrolled":true}');
  });

  it("takes the Default where no rule matches", async () => {
    // Given the same state machine, with a Default to fall back on.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      branchingStates({ Default: "Decline" }),
    );

    // When an execution runs on an input no rule matches.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Li","term":1}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it went to the Default and failed there.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "NotEligible");
  });

  it("fails an execution that matches nothing and has no Default", async () => {
    // Given a Choice state with no Default.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(
      simAws.stepFunctions(),
      branchingStates({}),
    );

    // When an execution runs on an input no rule matches.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Li","term":1}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution failed with the name Amazon States Language gives it.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.NoChoiceMatched");
  });

  it("tests the input its InputPath narrowed, and passes on its OutputPath", async () => {
    // Given a Choice state reading one part of its input and passing on
    // another.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(simAws.stepFunctions(), {
      Eligible: {
        Type: "Choice",
        InputPath: "$.enrolment",
        OutputPath: "$.student",
        Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        Default: "Decline",
      },
      Enrol: { Type: "Succeed" },
      Decline: { Type: "Fail", Error: "NotEligible" },
    });

    // When an execution runs on an input holding both.
    const started = await simAws.stepFunctions().startExecution({
      input: {
        stateMachineArn,
        input: '{"enrolment":{"term":3,"student":"Wei"}}',
      },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the rule was tested against the narrowed input, and what came out
    // was narrowed again on the way to the next state.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '"Wei"');
  });

  it("fails an execution comparing a field its input has not got", async () => {
    // Given a rule comparing a field with no IsPresent guarding it.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(simAws.stepFunctions(), {
      Eligible: {
        Type: "Choice",
        Choices: [{ Variable: "$.term", NumericEquals: 3, Next: "Enrol" }],
        Default: "Enrol",
      },
      Enrol: { Type: "Succeed" },
    });

    // When an execution runs on an input without it.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"student":"Wei"}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution failed rather than falling through to the Default.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.Runtime");
  });
});
