import { assertStringIncludes, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";

import type { JSONObject } from "../../../util/type-guard/json.js";
import { parseSimStatesDefinition } from "./sim-states-definition-parse.js";

describe("Step Functions Map state refusals", () => {
  /**
   * The states one `Map` state runs per item.
   */
  const registering: JSONObject = {
    StartAt: "Register",
    States: { Register: { Type: "Pass", End: true } },
  };

  /**
   * Read a definition of one `Map` state that is expected to be refused, and
   * answer with why.
   */
  function refusalFor(state: JSONObject): string {
    return assertThrowsError(() =>
      parseSimStatesDefinition(
        JSON.stringify({
          StartAt: "Enrol",
          States: { Enrol: { Type: "Map", End: true, ...state } },
        }),
      ),
    ).message;
  }

  it("refuses a Map state with nothing to run per item", () => {
    // Given a Map state carrying no ItemProcessor.
    // When it is read, it says a Map state needs one.
    assertStringIncludes(
      refusalFor({}),
      "The Map state Enrol needs an ItemProcessor holding the states it runs",
    );
  });

  it("refuses a Distributed Map by the fields that make it one", () => {
    // Given a Map state reading its items from S3 and writing them back.
    // When it is read, the refusal names the fields and what they are for.
    const refusal = refusalFor({
      ItemProcessor: registering,
      ItemReader: { Resource: "arn:aws:states:::s3:getObject" },
      ResultWriter: { Resource: "arn:aws:states:::s3:putObject" },
      ToleratedFailureCount: 2,
    });

    assertStringIncludes(
      refusal,
      "carries ItemReader, ResultWriter, ToleratedFailureCount",
    );
    assertStringIncludes(refusal, "belong to a Distributed Map");
  });

  it("refuses a processor that runs as a Distributed Map", () => {
    // Given an ItemProcessor whose ProcessorConfig asks for DISTRIBUTED.
    // When it is read, it is refused by the mode it named.
    assertStringIncludes(
      refusalFor({
        ItemProcessor: {
          ...registering,
          ProcessorConfig: { Mode: "DISTRIBUTED", ExecutionType: "STANDARD" },
        },
      }),
      'ProcessorConfig Mode of "DISTRIBUTED"',
    );
  });

  it("refuses a Map state carrying both spellings of a field", () => {
    // Given a Map state carrying the old field name beside the new one.
    // When each is read, each says which is the older spelling.
    assertStringIncludes(
      refusalFor({ ItemProcessor: registering, Iterator: registering }),
      "carries both ItemProcessor and Iterator",
    );
    assertStringIncludes(
      refusalFor({
        ItemProcessor: registering,
        ItemSelector: { "id.$": "$$.Map.Item.Value.id" },
        Parameters: { "id.$": "$$.Map.Item.Value.id" },
      }),
      "carries both ItemSelector and Parameters",
    );
  });

  it("refuses an ItemSelector that is not a Payload Template", () => {
    // Given an ItemSelector written as something other than an object.
    // When it is read, it says what an ItemSelector is.
    assertStringIncludes(
      refusalFor({ ItemProcessor: registering, ItemSelector: "$.students" }),
      "has an ItemSelector that is not an object",
    );
  });

  it("refuses an ItemsPath that is not a Reference Path", () => {
    // Given an ItemsPath written as a number, and one written as a path this
    // simulator does not read.
    // When each is read, each is refused.
    assertStringIncludes(
      refusalFor({ ItemProcessor: registering, ItemsPath: 3 }),
      "has an ItemsPath that is not a Reference Path",
    );
    assertStringIncludes(
      refusalFor({
        ItemProcessor: registering,
        ItemsPath: "$.students[*].id",
      }),
      "uses a bracket this simulator does not read",
    );
  });

  it("refuses a MaxConcurrency outside what it can be", () => {
    // Given bounds that are not a whole number of iterations.
    // When each is read, each says what the field takes.
    for (const bound of [-1, 1.5, "2"]) {
      assertStringIncludes(
        refusalFor({ ItemProcessor: registering, MaxConcurrency: bound }),
        `has a MaxConcurrency of ${JSON.stringify(bound)}`,
      );
    }
  });

  it("refuses an item processor using something this simulator does not run", () => {
    // Given a processor holding a Distributed Map of its own.
    // When it is read, the refusal names the processor it was written in.
    assertStringIncludes(
      refusalFor({
        ItemProcessor: {
          StartAt: "Register",
          States: {
            Register: {
              Type: "Map",
              ItemReader: { Resource: "arn:aws:states:::s3:getObject" },
              ItemProcessor: registering,
              End: true,
            },
          },
        },
      }),
      "The ItemProcessor of the Map state Enrol:",
    );
  });

  it("refuses the fields a Map state does not have", () => {
    // Given a Map state carrying a task's timeout.
    // When it is read, it names the field and the type.
    assertStringIncludes(
      refusalFor({ ItemProcessor: registering, TimeoutSeconds: 5 }),
      "The Map state Enrol carries TimeoutSeconds",
    );
  });
});
