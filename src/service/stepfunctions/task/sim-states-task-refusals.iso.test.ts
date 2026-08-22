import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import { parseSimStatesDefinition } from "../definition/sim-states-definition-parse.js";

describe("Step Functions Task state refusals", () => {
  /**
   * Read a definition of one Task state, and answer with why it was refused.
   */
  function refusalForTask(task: object): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({ StartAt: "Check", States: { Check: task } }),
      ),
    ).message;
  }

  it("refuses a Resource that names no work, naming it", () => {
    // Given a Resource that is neither a function nor a service integration.
    // When each is read, each names what the definition asked for.
    for (const resource of [
      "arn:aws:sqs:eu-west-2:123456789012:enrolments",
      "check-enrolment",
    ]) {
      const refusal = refusalForTask({
        Type: "Task",
        Resource: resource,
        End: true,
      });

      assertStringIncludes(refusal, resource);
      assertStringIncludes(refusal, "arn:aws:states:::lambda:invoke");
    }
  });

  it("refuses a Task state that says nothing about what it does", () => {
    // Given a Task state with no Resource.
    // When it is read, it is refused.
    assertStringIncludes(
      refusalForTask({ Type: "Task", End: true }),
      "has no Resource",
    );
  });

  it("refuses the Task fields this simulator does not run, by name", () => {
    // Given the fields that would change what a task does.
    // When each is read, each is named.
    assertStringIncludes(
      refusalForTask({
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: "check-enrolment" },
        TimeoutSecondsPath: "$.allowed",
        End: true,
      }),
      "carries TimeoutSecondsPath",
    );
    assertStringIncludes(
      refusalForTask({
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { FunctionName: "check-enrolment" },
        Credentials: { RoleArn: "arn:aws:iam::123456789012:role/Other" },
        End: true,
      }),
      "carries Credentials",
    );
  });

  it("refuses an invocation that names no function to invoke", () => {
    // Given the Lambda integration without the Parameters it takes.
    // When each is read, each says what is missing.
    assertStringIncludes(
      refusalForTask({
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        End: true,
      }),
      "carries no Parameters",
    );
    assertStringIncludes(
      refusalForTask({
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { "Payload.$": "$" },
        End: true,
      }),
      "carry no FunctionName",
    );
  });

  it("refuses the fields of an Invoke this simulator does not make", () => {
    // Given an invocation asking for something other than a plain call.
    // When it is read, it names the field.
    assertStringIncludes(
      refusalForTask({
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: {
          FunctionName: "check-enrolment",
          InvocationType: "Event",
        },
        End: true,
      }),
      "carry InvocationType",
    );
  });

  it("reads a function named by a path as naming the function", () => {
    // Given an invocation reading its function name out of the input, which is
    // the same field written the other way.
    const definition = parseSimStatesDefinition(
      JSON.stringify({
        StartAt: "Check",
        States: {
          Check: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            Parameters: { "FunctionName.$": "$.checker", "Payload.$": "$" },
            End: true,
          },
        },
      }),
    );

    // When the definition is read, the state is one this simulator runs.
    assertStringIncludes(definition.StartAt, "Check");
  });
});
