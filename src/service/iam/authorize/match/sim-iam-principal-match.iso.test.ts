import { assertFalse, assertTrue } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIamPrincipalMatch } from "./sim-iam-principal-match.js";

describe("SimIamPrincipalMatch.first", () => {
  it("prefers a direct match over a delegated one", () => {
    // Given a Principal list matching both by Account delegation and by naming
    // the caller, which is what a key policy holding both statements produces.
    const matches = [
      SimIamPrincipalMatch.accountDelegation(),
      SimIamPrincipalMatch.direct(),
    ];

    // When the winning match is chosen.
    const first = SimIamPrincipalMatch.first(matches);

    // Then the direct grant wins: a statement naming the caller grants to the
    // caller whatever else the policy says.
    assertTrue(first.matched);
    assertFalse(first.isAccountDelegation);
  });

  it("keeps a delegated match when nothing names the caller", () => {
    // Given only an Account delegation, as the default KMS key policy gives.
    const matches = [
      SimIamPrincipalMatch.none(),
      SimIamPrincipalMatch.accountDelegation(),
    ];

    // When the winning match is chosen.
    const first = SimIamPrincipalMatch.first(matches);

    // Then it is still a match, and still marked as delegation, so a rule that
    // cares can require an identity policy as well.
    assertTrue(first.matched);
    assertTrue(first.isAccountDelegation);
  });

  it("reports no match when nothing applies", () => {
    // Given nothing matching.
    const matches = [SimIamPrincipalMatch.none(), SimIamPrincipalMatch.none()];

    // When the winning match is chosen.
    const first = SimIamPrincipalMatch.first(matches);

    // Then there is none.
    assertFalse(first.matched);
    assertFalse(first.isAccountDelegation);
  });
});
