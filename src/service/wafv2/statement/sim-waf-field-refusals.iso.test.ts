import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import { simWafStatementMatches } from "../sim-wafv2.fixture.js";
import type { SimWafFieldToMatchInput } from "./sim-waf-field-to-match.type.js";

/**
 * Try to write a rule that reads one field, and answer with the refusal.
 */
async function refusalForField(field: SimWafFieldToMatchInput): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simWafStatementMatches(new SimAws().wafV2(), {
      ByteMatchStatement: {
        SearchString: "x",
        PositionalConstraint: "CONTAINS",
        FieldToMatch: field,
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
  });
}

describe("SimWafV2 field to match refusals", () => {
  it("refuses a field naming two request components", async () => {
    // When one statement reads both the path and the method.
    const error = await refusalForField({ UriPath: {}, Method: {} });

    // Then it is refused. Real WAF inspects one component per statement, and
    // a rule that wants two is written as two rules.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "UriPath and Method");
  });

  it("refuses a match pattern naming two selectors", async () => {
    // When a header pattern both includes and excludes.
    const error = await refusalForField({
      Headers: {
        MatchPattern: {
          IncludedHeaders: ["referer"],
          ExcludedHeaders: ["user-agent"],
        },
        MatchScope: "VALUE",
        OversizeHandling: "CONTINUE",
      },
    });

    // Then it is refused rather than one of them quietly winning.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "match pattern");
  });

  it("refuses a match pattern naming none", async () => {
    // When a cookie pattern selects nothing at all.
    const error = await refusalForField({
      Cookies: {
        MatchPattern: {},
        MatchScope: "KEY",
        OversizeHandling: "CONTINUE",
      },
    });

    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses a match pattern whose list is empty", async () => {
    // When a header pattern includes an empty list of names.
    const error = await refusalForField({
      Headers: {
        MatchPattern: { IncludedHeaders: [] },
        MatchScope: "VALUE",
        OversizeHandling: "CONTINUE",
      },
    });

    // Then it is refused, rather than reading no headers while looking like it
    // read some.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });
});
