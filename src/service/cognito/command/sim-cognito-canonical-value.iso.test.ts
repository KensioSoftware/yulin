import { assertArrayEquals, assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimCognitoCanonicalValue } from "./sim-cognito-canonical-value.js";

describe("sim Cognito canonical value", () => {
  it("matches two objects whose keys were written in different orders", () => {
    // Given a value whose keys are in the order CDK emits them.
    const canonical = new SimCognitoCanonicalValue({
      DefaultEmailOption: "CONFIRM_WITH_CODE",
      EmailSubject: "Verify your new account",
    });

    // When it is compared with the same settings written the other way round.
    const matches = canonical.matches({
      EmailSubject: "Verify your new account",
      DefaultEmailOption: "CONFIRM_WITH_CODE",
    });

    // Then they say the same thing, because the order keys are written in
    // carries no meaning.
    assertTrue(matches);
  });

  it("refuses an object carrying a key the other one does not", () => {
    // Given a value with one key.
    const canonical = new SimCognitoCanonicalValue({
      AllowAdminCreateUserOnly: true,
    });

    // When it is compared with the same key plus another.
    const matches = canonical.matches({
      AllowAdminCreateUserOnly: true,
      UnusedAccountValidityDays: 7,
    });

    // Then they do not match, so a request asking for more than the simulated
    // value is refused rather than accepted for the part that agrees.
    assertFalse(matches);
  });

  it("keeps the order of a list, where the order is part of what it says", () => {
    // Given a recovery setting listing two mechanisms in priority order.
    const canonical = new SimCognitoCanonicalValue({
      RecoveryMechanisms: [
        { Name: "verified_phone_number", Priority: 1 },
        { Name: "verified_email", Priority: 2 },
      ],
    });

    // When it is compared with the same two mechanisms the other way round.
    const matches = canonical.matches({
      RecoveryMechanisms: [
        { Name: "verified_email", Priority: 2 },
        { Name: "verified_phone_number", Priority: 1 },
      ],
    });

    // Then they do not match, because a list saying its entries in a
    // different order is saying something different.
    assertFalse(matches);
  });

  it("renders the values a refusal prints back", () => {
    // Given values of each kind a Cognito property carries.
    const values = ["OFF", 7, false, null, { B: [1, 2], A: "x" }] as const;

    // When each is rendered.
    const rendered = values.map(
      (value) => new SimCognitoCanonicalValue(value).text,
    );

    // Then the rendering is the JSON a refusal can print.
    assertArrayEquals(rendered, [
      '"OFF"',
      "7",
      "false",
      "null",
      '{"A":"x","B":[1,2]}',
    ]);
  });
});
