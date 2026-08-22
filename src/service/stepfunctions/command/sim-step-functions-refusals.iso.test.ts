import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimStepFunctions } from "../sim-step-functions.js";

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

describe("Simulated Step Functions request refusals", () => {
  it("refuses a CreateStateMachine missing what it needs", async () => {
    // Given a simulated Step Functions.
    const simAws = new SimAws();
    const stepFunctions: SimStepFunctions = simAws.stepFunctions();

    // When each required field is left out.
    const noName = await refusalFor(
      async () =>
        await stepFunctions.createStateMachine({
          input: { roleArn, definition: passThrough },
        }),
    );
    const noDefinition = await refusalFor(
      async () =>
        await stepFunctions.createStateMachine({
          input: { name: "Enrolment", roleArn },
        }),
    );
    const noRole = await refusalFor(
      async () =>
        await stepFunctions.createStateMachine({
          input: { name: "Enrolment", definition: passThrough },
        }),
    );

    // Then each names what was missing.
    assertStringIncludes(noName, "needs a name");
    assertStringIncludes(noDefinition, "needs a definition");
    assertStringIncludes(noRole, "needs a roleArn");
  });

  it("refuses a state machine type that is neither STANDARD nor EXPRESS", async () => {
    // Given a request naming another type.
    const simAws = new SimAws();

    // When it is created.
    const refusal = await refusalFor(
      async () =>
        await simAws.stepFunctions().createStateMachine({
          input: {
            name: "Enrolment",
            roleArn,
            definition: passThrough,
            type: "SYNCHRONOUS",
          },
        }),
    );

    // Then the type is refused.
    assertStringIncludes(refusal, "is not a state machine type");
  });

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

  it("refuses an execution input that is not JSON", async () => {
    // Given a state machine.
    const simAws = new SimAws();
    const created = await simAws.stepFunctions().createStateMachine({
      input: { name: "Enrolment", roleArn, definition: passThrough },
    });

    // When an execution is started with something that will not parse.
    const refusal = await refusalFor(
      async () =>
        await simAws.stepFunctions().startExecution({
          input: {
            stateMachineArn: created.stateMachineArn,
            input: "not json",
          },
        }),
    );

    // Then it is refused before the execution begins.
    assertStringIncludes(refusal, "is not JSON");
  });

  it("refuses an update naming a state machine that is not there", async () => {
    // Given a simulated Step Functions holding nothing.
    const simAws = new SimAws();

    // When an absent state machine is updated.
    const refusal = await refusalFor(
      async () =>
        await simAws
          .stepFunctions()
          .updateStateMachine({ input: { stateMachineArn: absentArn } }),
    );

    // Then it is refused.
    assertStringIncludes(refusal, "not a simulated state machine");
  });
});
