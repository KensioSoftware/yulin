import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimStepFunctions } from "../sim-step-functions.js";

const roleArn = "arn:aws:iam::123456789012:role/WorkflowRole";

const passThrough = JSON.stringify({
  StartAt: "Only",
  States: { Only: { Type: "Pass", End: true } },
});

/**
 * Create a state machine of a given name.
 */
async function givenAStateMachine(
  stepFunctions: SimStepFunctions,
  name: string,
): Promise<string> {
  const created = await stepFunctions.createStateMachine({
    input: { name, roleArn, definition: passThrough },
  });

  return created.stateMachineArn;
}

describe("Simulated Step Functions state machines", () => {
  it("creates a state machine reachable by the ARN it answers with", async () => {
    // Given a simulated Step Functions.
    const simAws = new SimAws();

    // When a state machine is created and read back.
    const arn = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    const described = await simAws
      .stepFunctions()
      .describeStateMachine({ input: { stateMachineArn: arn } });

    // Then the ARN names it, and the definition comes back as it was sent.
    assertStringIncludes(arn, ":stateMachine:Enrolment");
    assertIdentical(described.name, "Enrolment");
    assertIdentical(described.definition, passThrough);
    assertIdentical(described.status, "ACTIVE");
    assertIdentical(described.type, "STANDARD");
  });

  it("answers a repeat CreateStateMachine with the one already there", async () => {
    // Given a state machine that is already there.
    const simAws = new SimAws();
    const first = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");

    // When the same request is made again.
    const second = await givenAStateMachine(
      simAws.stepFunctions(),
      "Enrolment",
    );

    // Then it answers with the same ARN, as real Step Functions does.
    assertIdentical(second, first);
  });

  it("ignores a differing roleArn on a repeat CreateStateMachine", async () => {
    // Given a state machine that is already there.
    const simAws = new SimAws();
    const first = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");

    // When the same name and definition arrive with another role.
    const second = await simAws.stepFunctions().createStateMachine({
      input: {
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/Another",
        definition: passThrough,
      },
    });
    const described = await simAws
      .stepFunctions()
      .describeStateMachine({ input: { stateMachineArn: first } });

    // Then it is the same state machine and the role stayed as it was.
    assertIdentical(second.stateMachineArn, first);
    assertStringIncludes(described.roleArn, "role/WorkflowRole");
  });

  it("refuses a second state machine of the same name and another definition", async () => {
    // Given a state machine that is already there.
    const simAws = new SimAws();
    await givenAStateMachine(simAws.stepFunctions(), "Enrolment");

    // When that name is used for a different definition.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.stepFunctions().createStateMachine({
          input: {
            name: "Enrolment",
            roleArn,
            definition: JSON.stringify({
              StartAt: "Only",
              States: { Only: { Type: "Succeed" } },
            }),
          },
        }),
    );

    // Then the idempotency check refuses it.
    assertStringIncludes(error.message, "different definition or type");
  });

  it("lists state machines by name", async () => {
    // Given three state machines created out of order.
    const simAws = new SimAws();
    await givenAStateMachine(simAws.stepFunctions(), "Reporting");
    await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    await givenAStateMachine(simAws.stepFunctions(), "Marking");

    // When they are listed.
    const listed = await simAws
      .stepFunctions()
      .listStateMachines({ input: {} });

    // Then they come back in name order.
    assertArrayLength(listed.stateMachines, 3);
    assertIdentical(listed.stateMachines[0].name, "Enrolment");
    assertIdentical(listed.stateMachines[2].name, "Reporting");
  });

  it("caps a listing at the maxResults it was given", async () => {
    // Given two state machines.
    const simAws = new SimAws();
    await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    await givenAStateMachine(simAws.stepFunctions(), "Marking");

    // When one is asked for.
    const listed = await simAws
      .stepFunctions()
      .listStateMachines({ input: { maxResults: 1 } });

    // Then only one comes back.
    assertArrayLength(listed.stateMachines, 1);
  });

  it("takes a new definition through UpdateStateMachine", async () => {
    // Given a state machine that passes its input through.
    const simAws = new SimAws();
    const arn = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    const failing = JSON.stringify({
      StartAt: "Only",
      States: { Only: { Type: "Fail", Error: "Closed" } },
    });

    // When the definition is replaced and an execution runs.
    await simAws.stepFunctions().updateStateMachine({
      input: { stateMachineArn: arn, definition: failing },
    });
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn: arn } });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution ran the definition that replaced the first.
    assertIdentical(described.error, "Closed");
  });

  it("leaves a state machine unchanged where an update carries only a role", async () => {
    // Given a state machine.
    const simAws = new SimAws();
    const arn = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");

    // When only the role is changed.
    await simAws.stepFunctions().updateStateMachine({
      input: {
        stateMachineArn: arn,
        roleArn: "arn:aws:iam::123456789012:role/Another",
      },
    });
    const described = await simAws
      .stepFunctions()
      .describeStateMachine({ input: { stateMachineArn: arn } });

    // Then the definition is as it was and the role has moved.
    assertIdentical(described.definition, passThrough);
    assertStringIncludes(described.roleArn, "role/Another");
  });

  it("forgets a deleted state machine and its executions", async () => {
    // Given a state machine that has run once.
    const simAws = new SimAws();
    const arn = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn: arn } });

    // When it is deleted.
    await simAws
      .stepFunctions()
      .deleteStateMachine({ input: { stateMachineArn: arn } });

    // Then neither it nor its execution can be reached.
    const machineError = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .stepFunctions()
          .describeStateMachine({ input: { stateMachineArn: arn } }),
    );
    const executionError = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .stepFunctions()
          .describeExecution({ input: { executionArn: started.executionArn } }),
    );

    assertStringIncludes(machineError.message, "not a simulated state machine");
    assertStringIncludes(executionError.message, "not a simulated execution");
  });

  it("refuses a second execution of the same name", async () => {
    // Given a state machine with a named execution.
    const simAws = new SimAws();
    const arn = await givenAStateMachine(simAws.stepFunctions(), "Enrolment");
    await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn: arn, name: "first" } });

    // When another of that name is started.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .stepFunctions()
          .startExecution({ input: { stateMachineArn: arn, name: "first" } }),
    );

    // Then it is refused, which is what makes the name usable for idempotency.
    assertStringIncludes(error.message, "already has an execution");
  });
});
