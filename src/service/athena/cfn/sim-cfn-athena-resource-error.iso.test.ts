import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAthenaInvalidRequestException } from "../error/sim-athena.error.js";
import { simCfnAthenaResourceCreation } from "./sim-cfn-athena-resource-error.js";

describe("Athena CloudFormation Resource refusals", () => {
  it("names the Resource in a refusal simulated Athena decided", async () => {
    // Given a Resource whose creation the simulated service refuses.
    const creating = (): Promise<never> =>
      Promise.reject(
        new SimAthenaInvalidRequestException(
          "WorkGroup rainlytics is already created.",
        ),
      );

    // When it is run.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnAthenaResourceCreation(
        "AWS::Athena::WorkGroup",
        "Queries",
        creating,
      );
    });

    // Then the refusal says which Resource it was, with Athena's own reason
    // inside it, and reads as an invalid Resource rather than an unsupported
    // one, which is what stops the Stack stepping over it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Athena::WorkGroup Resource Queries",
    );
    assertStringIncludes(error.message, "is already created");
    assertIdentical((error.cause as Error).name, "InvalidRequestException");
  });

  it("leaves an error that came from somewhere else alone", async () => {
    // Given creation failing for a reason that is nothing to do with Athena,
    // such as a bug in the CloudFormation layer above it.
    const creating = (): Promise<never> =>
      Promise.reject(new TypeError("resolvedProperties is not iterable"));

    // When it is run.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnAthenaResourceCreation(
        "AWS::Athena::WorkGroup",
        "Queries",
        creating,
      );
    });

    // Then it comes through with its own wording, rather than being dressed up
    // as a refusal Athena decided.
    assertIdentical(error.name, "TypeError");
    assertIdentical(error.message, "resolvedProperties is not iterable");
  });
});
