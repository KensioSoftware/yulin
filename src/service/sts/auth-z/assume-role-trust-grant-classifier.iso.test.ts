import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { AssumeRoleTrustGrantClassifier } from "./assume-role-trust-grant-classifier.js";

describe("AssumeRole trust grant classification", () => {
  it("classifies a matching NotPrincipal statement as a direct grant", () => {
    // Given a matching trust statement that excludes another principal.
    const classifier = new AssumeRoleTrustGrantClassifier();

    // When the statement grant is classified.
    const isDirectGrant = classifier.hasDirectPrincipalGrant([
      {
        Effect: "Allow",
        NotPrincipal: {
          AWS: "arn:aws:iam::123456789012:user/ExcludedUser",
        },
        Action: "sts:AssumeRole",
      },
    ]);

    // Then the grant applies directly to the non-excluded caller.
    assertTrue(isDirectGrant);
  });

  it("does not classify a statement without a principal as a direct grant", () => {
    // Given a statement with neither Principal nor NotPrincipal.
    const classifier = new AssumeRoleTrustGrantClassifier();

    // When the incomplete statement is classified defensively.
    const isDirectGrant = classifier.hasDirectPrincipalGrant([
      {
        Effect: "Allow",
        Action: "sts:AssumeRole",
      },
    ]);

    // Then it cannot provide a direct principal grant.
    assertFalse(isDirectGrant);
  });
});
