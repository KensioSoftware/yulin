import { describe, it } from "vitest";
import { assertIdentical, assertThrowsError } from "@kensio/smartass";
import { assertDefined, assertNotNull } from "./defined.js";

describe("type-guard assertion util functions", () => {
  describe("assertDefined", () => {
    it("throws on undefined value", () => {
      const error = assertThrowsError(() => {
        assertDefined(undefined, "foo value");
      });
      assertIdentical(error.message, "foo value must be defined");
    });

    it("does not throw on defined value", () => {
      assertDefined("foo", "foo value");
    });
  });

  describe("assertNotNull", () => {
    it("throws on null value", () => {
      const error = assertThrowsError(() => {
        assertNotNull(null, "foo value");
      });
      assertIdentical(error.message, "foo value must not be null");
    });

    it("does not throw on non-null value", () => {
      assertNotNull("foo", "foo value");
    });
  });
});
