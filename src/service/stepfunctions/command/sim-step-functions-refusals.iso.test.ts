import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";

const roleArn = "arn:aws:iam::123456789012:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

/**
 * Create a state machine, for the calls that need one to exist.
 */
async function givenAStateMachine(simAws: SimAws): Promise<string> {
  const created = await simAws.stepFunctions().createStateMachine({
    input: { name: "Enrolment", roleArn, definition: passThrough },
  });

  return created.stateMachineArn;
}

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
    const stepFunctions = simAws.stepFunctions();

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

  it("refuses an execution input that is not JSON", async () => {
    // Given a state machine.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(simAws);

    // When an execution is started with something that will not parse.
    const refusal = await refusalFor(
      async () =>
        await simAws.stepFunctions().startExecution({
          input: { stateMachineArn, input: "not json" },
        }),
    );

    // Then it is refused before the execution begins.
    assertStringIncludes(refusal, "is not JSON");
  });

  it("refuses an update with nothing to change", async () => {
    // Given a state machine.
    const simAws = new SimAws();
    const stateMachineArn = await givenAStateMachine(simAws);

    // When it is updated with neither a definition nor a role.
    const refusal = await refusalFor(
      async () =>
        await simAws
          .stepFunctions()
          .updateStateMachine({ input: { stateMachineArn } }),
    );

    // Then the request is refused before anything is looked up.
    assertStringIncludes(refusal, "needs a definition or a roleArn");
  });
});
