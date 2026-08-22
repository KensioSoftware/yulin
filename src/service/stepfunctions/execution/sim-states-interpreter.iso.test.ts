import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { BackgroundTasks } from "../../../util/background/background.js";
import type { SimStatesDefinition } from "../definition/sim-states-definition.js";
import type { SimStatesState } from "../definition/sim-states-state.js";
import { SimStatesExecution } from "./sim-states-execution.js";
import { SimStatesInterpreter } from "./sim-states-interpreter.js";

/**
 * Run a definition the parser would never have let through, to reach the
 * interpreter's own guards.
 */
async function runDefinition(
  definition: SimStatesDefinition,
): Promise<SimStatesExecution> {
  const background = new BackgroundTasks();
  const execution = new SimStatesExecution({
    arn: "arn:aws:states:eu-west-2:123456789012:execution:Enrolment:one",
    name: "one",
    stateMachineArn:
      "arn:aws:states:eu-west-2:123456789012:stateMachine:Enrolment",
    input: {},
    startDate: background.now(),
  });

  await new SimStatesInterpreter({ definition, execution, background }).run();

  return execution;
}

describe("Step Functions interpreter guards", () => {
  it("fails an execution moving to a state that is not there", async () => {
    // Given a definition whose transition names nothing, which the parser
    // refuses and a hand-built definition can still carry.
    const states = new Map<string, SimStatesState>([
      ["Only", { Type: "Pass", Next: "Absent" }],
    ]);

    // When it runs.
    const execution = await runDefinition({ StartAt: "Only", States: states });

    // Then the execution failed rather than the walk raising.
    assertIdentical(execution.status, "FAILED");
    assertIdentical(execution.error, "States.Runtime");
    assertStringIncludes(execution.cause ?? "", "Absent");
  });

  it("fails an execution on an error that carries no states error name", async () => {
    // Given a Pass state whose Result getter raises something ordinary.
    const raising = {
      Type: "Pass",
      End: true,
      get Result(): never {
        throw new Error("the definition was tampered with");
      },
    } as unknown as SimStatesState;

    // When it runs.
    const execution = await runDefinition({
      StartAt: "Only",
      States: new Map([["Only", raising]]),
    });

    // Then it is reported as a runtime failure carrying the message.
    assertIdentical(execution.status, "FAILED");
    assertIdentical(execution.error, "States.Runtime");
    assertStringIncludes(execution.cause ?? "", "tampered with");
  });

  it("fails an execution on something raised that is not an Error", async () => {
    // Given a state raising a bare value.
    const raising = {
      Type: "Pass",
      End: true,
      get Result(): never {
        // eslint-disable-next-line no-throw-literal
        throw "a bare string" as unknown as Error;
      },
    } as unknown as SimStatesState;

    // When it runs.
    const execution = await runDefinition({
      StartAt: "Only",
      States: new Map([["Only", raising]]),
    });

    // Then the value is read as the cause.
    assertIdentical(execution.cause, "a bare string");
  });
});
