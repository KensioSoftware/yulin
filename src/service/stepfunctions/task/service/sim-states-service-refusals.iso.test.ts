import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import { parseSimStatesDefinition } from "../../definition/sim-states-definition-parse.js";

describe("Step Functions service integration refusals", () => {
  /**
   * Read a definition of one Task state, and answer with why it was refused.
   */
  function refusalForResource(resource: string): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Work",
          States: {
            Work: { Type: "Task", Resource: resource, End: true },
          },
        }),
      ),
    ).message;
  }

  it("refuses a service this simulation does not have, naming the call", () => {
    // Given an SDK integration calling a service nothing here simulates.
    // When the state machine is created, the refusal names what it asked for.
    const refusal = refusalForResource(
      "arn:aws:states:::aws-sdk:textract:analyzeDocument",
    );

    assertStringIncludes(refusal, "analyzeDocument");
    assertStringIncludes(refusal, "textract");
    assertStringIncludes(refusal, "dynamodb");
  });

  it("refuses an optimized integration it has no implementation for", () => {
    // Given the integrations for services this simulator does not reach.
    // When each is read, each names the Resource and what is on offer.
    for (const resource of [
      "arn:aws:states:::ecs:runTask",
      "arn:aws:states:::glue:startJobRun",
      "arn:aws:states:::dynamodb:query",
    ]) {
      const refusal = refusalForResource(resource);

      assertStringIncludes(refusal, resource);
      assertStringIncludes(refusal, "aws-sdk:<service>:<operation>");
    }
  });

  it("refuses the patterns that hold a task open, naming the pattern", () => {
    // Given the two patterns a Task state waits under.
    // When each is read, each says which one it was.
    assertStringIncludes(
      refusalForResource("arn:aws:states:::ecs:runTask.sync"),
      ".sync",
    );
    assertStringIncludes(
      refusalForResource("arn:aws:states:::sqs:sendMessage.waitForTaskToken"),
      ".waitForTaskToken",
    );
  });

  it("refuses an SDK integration that names no operation", () => {
    // Given an SDK integration written with a service and nothing else.
    // When it is read, it says what one looks like.
    assertStringIncludes(
      refusalForResource("arn:aws:states:::aws-sdk:dynamodb"),
      "arn:aws:states:::aws-sdk:dynamodb:putItem",
    );
  });
});
