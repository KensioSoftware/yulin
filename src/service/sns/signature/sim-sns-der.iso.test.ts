import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { derInteger } from "./sim-sns-der.js";

describe("DER integer", () => {
  it("writes a magnitude of nothing but zeroes as zero", () => {
    // Given bytes that name no number at all, which nothing a certificate
    // numbers is and which the encoding is still asked for.
    const magnitude = Buffer.alloc(4);

    // When they are written as a DER integer.
    const written = derInteger(magnitude);

    // Then they are written as the single byte DER writes zero as, rather than
    // as the four they arrived as or as no bytes at all, both of which a
    // reader refuses.
    assertIdentical(written.toString("hex"), "020100");
  });

  it("writes no bytes at all as zero", () => {
    // Given no bytes.
    // When they are written as a DER integer.
    const written = derInteger(Buffer.alloc(0));

    // Then the value is zero, because an integer of no bytes is not a value a
    // reader can read.
    assertIdentical(written.toString("hex"), "020100");
  });
});
