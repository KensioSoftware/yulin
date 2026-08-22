import { describe, it } from "vitest";
import {
  assertStringIncludes,
  assertThrowsError,
  assertTypeFunction,
} from "@kensio/smartass";
import { cffHandlerFromSource } from "./cff-vm-source-handler.js";

describe("CFF source loading", () => {
  it("allows loading longer than a real invocation gets", () => {
    const source = `
      const startedAt = Date.now();
      while (Date.now() - startedAt < 60) {
        // Longer than the 50ms of compute a real invocation is allowed.
      }

      function handler(event) {
        return event.request;
      }
    `;

    const handler = cffHandlerFromSource(source);

    assertTypeFunction(handler);
  });

  it("gives up on a top level that never returns", () => {
    const source = `
      while (true) {
        // Never reaches the handler below.
      }

      function handler(event) {
        return event.request;
      }
    `;

    const error = assertThrowsError(() =>
      cffHandlerFromSource(source, undefined, 50),
    );

    assertStringIncludes(error.message, "did not finish loading within 50ms");
    assertStringIncludes(
      String((error.cause as { message?: string }).message),
      "Script execution timed out after 50ms",
    );
  });
});
