import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { describe, it } from "vitest";
import { parseZoneMaxItems } from "./parse-zone-max-items.js";

describe("parseZoneMaxItems", () => {
  it("returns the default MaxItems when input is undefined", () => {
    const maxItems = parseZoneMaxItems(undefined);

    assertIdentical(maxItems, 100);
  });

  it("parses a positive integer MaxItems input", () => {
    const maxItems = parseZoneMaxItems("25");

    assertIdentical(maxItems, 25);
  });

  it("rejects decimal MaxItems input", () => {
    const error = assertThrowsError(() => {
      parseZoneMaxItems("1.5");
    });

    assertIdentical(
      error.message,
      "ListHostedZonesByNameCommand.input.MaxItems is invalid",
    );
  });

  it("rejects mixed alphanumeric MaxItems input", () => {
    const error = assertThrowsError(() => {
      parseZoneMaxItems("10abc");
    });

    assertIdentical(
      error.message,
      "ListHostedZonesByNameCommand.input.MaxItems is invalid",
    );
  });

  it("rejects MaxItems input greater than the max safe integer", () => {
    const error = assertThrowsError(() => {
      parseZoneMaxItems("9007199254740992");
    });

    assertIdentical(
      error.message,
      "ListHostedZonesByNameCommand.input.MaxItems is invalid",
    );
  });
});
