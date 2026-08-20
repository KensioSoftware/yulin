import {
  CreateRegexPatternSetCommand,
  DeleteRegexPatternSetCommand,
  GetRegexPatternSetCommand,
  ListRegexPatternSetsCommand,
  UpdateRegexPatternSetCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayEquals,
  assertFalse,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
  SimWafOptimisticLockException,
  SimWafUnsimulatedInputException,
} from "./error/sim-wafv2.error.js";
import { simWafStatementMatches } from "./sim-wafv2.fixture.js";

describe("SimWafV2 regex pattern sets", () => {
  it("creates a regex pattern set and reads it back", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created and read back.
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      }),
    );
    const read = await waf.getRegexPatternSet(
      new GetRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it reports the expressions it was written with.
    assertArrayEquals(
      read.RegexPatternSet?.RegularExpressionList.map(
        (expression) => expression.RegexString,
      ),
      ["sqlmap"],
    );
  });

  it("creates a pattern set holding no expressions yet", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created without naming any expressions.
    const created = await waf.createRegexPatternSet({
      input: { Name: "empty", Scope: "REGIONAL" },
    });
    const read = await waf.getRegexPatternSet(
      new GetRegexPatternSetCommand({
        Name: "empty",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then it is there and empty.
    assertArrayEquals(read.RegexPatternSet?.RegularExpressionList ?? [], []);
  });

  it("refuses an expression that will not compile", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set carries something that is not an expression.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "broken",
          Scope: "REGIONAL",
          RegularExpressionList: [{ RegexString: "(unclosed" }],
        }),
      );
    });

    // Then it is refused where it was written rather than matching nothing
    // when a request arrives.
    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses an expression with no pattern in it", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set carries an expression naming nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "empty",
          Scope: "REGIONAL",
          RegularExpressionList: [{}],
        }),
      );
    });

    assertInstanceOf(error, SimWafInvalidParameterException);
  });

  it("refuses tags on a pattern set", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a pattern set is created with tags.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.createRegexPatternSet(
        new CreateRegexPatternSetCommand({
          Name: "tagged",
          Scope: "REGIONAL",
          RegularExpressionList: [],
          Tags: [{ Key: "Team", Value: "payments" }],
        }),
      );
    });

    assertInstanceOf(error, SimWafUnsimulatedInputException);
  });

  it("lists and deletes regex pattern sets", async () => {
    // Given a pattern set.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [],
      }),
    );

    // When it is deleted with its lock token.
    await waf.deleteRegexPatternSet(
      new DeleteRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
        LockToken: created.Summary?.LockToken,
      }),
    );

    const after = await waf.listRegexPatternSets(
      new ListRegexPatternSetsCommand({ Scope: "REGIONAL" }),
    );

    // Then it is gone.
    assertArrayEquals(after.RegexPatternSets ?? [], []);
  });

  it("refuses a delete against a stale lock token", async () => {
    // Given a pattern set that has been read once.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "bad-agents",
        Scope: "REGIONAL",
        RegularExpressionList: [],
      }),
    );

    // When it is deleted with a token that is not the one it holds.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.deleteRegexPatternSet(
        new DeleteRegexPatternSetCommand({
          Name: "bad-agents",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
      );
    });

    // Then it is refused and the pattern set is still there.
    assertInstanceOf(error, SimWafOptimisticLockException);
  });

  it("refuses a read of a pattern set that is not there", async () => {
    // Given a simulated WAFv2 with nothing in it.
    const waf = new SimAws().wafV2();

    // When one is read by a name naming none.
    const error = await assertThrowsErrorAsync(async () => {
      await waf.getRegexPatternSet(
        new GetRegexPatternSetCommand({
          Name: "missing",
          Scope: "REGIONAL",
          Id: "0f5a1b2c-3d4e-5f60-7182-93a4b5c6d7e8",
        }),
      );
    });

    assertInstanceOf(error, SimWafNonexistentItemException);
  });

  it("follows a pattern set that changes under it", async () => {
    // Given a rule pointing at a pattern set that matches nothing yet.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "scanners",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "nikto" }],
      }),
    );

    assertNonNullable(created.Summary);

    const matches = await simWafStatementMatches(waf, {
      RegexPatternSetReferenceStatement: {
        ARN: created.Summary.ARN,
        FieldToMatch: { SingleHeader: { Name: "user-agent" } },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    });
    const request = new Request("https://example.test/", {
      headers: { "user-agent": "sqlmap" },
    });

    assertFalse(matches(request));

    // When the set gains the expression the request would match.
    await waf.updateRegexPatternSet(
      new UpdateRegexPatternSetCommand({
        Name: "scanners",
        Scope: "REGIONAL",
        Id: created.Summary.Id,
        LockToken: created.Summary.LockToken,
        RegularExpressionList: [{ RegexString: "sqlmap" }],
      }),
    );

    // Then the rule follows it, without the web ACL being rewritten.
    assertTrue(matches(request));
  });

  it("keeps the expressions it had when an update is refused", async () => {
    // Given a pattern set with one expression in it.
    const waf = new SimAws().wafV2();
    const created = await waf.createRegexPatternSet(
      new CreateRegexPatternSetCommand({
        Name: "scanners",
        Scope: "REGIONAL",
        RegularExpressionList: [{ RegexString: "nikto" }],
      }),
    );

    // When an update carrying an expression that will not compile is refused.
    await assertThrowsErrorAsync(async () => {
      await waf.updateRegexPatternSet(
        new UpdateRegexPatternSetCommand({
          Name: "scanners",
          Scope: "REGIONAL",
          Id: created.Summary?.Id,
          LockToken: created.Summary?.LockToken,
          RegularExpressionList: [{ RegexString: "(unclosed" }],
        }),
      );
    });

    const read = await waf.getRegexPatternSet(
      new GetRegexPatternSetCommand({
        Name: "scanners",
        Scope: "REGIONAL",
        Id: created.Summary?.Id,
      }),
    );

    // Then the set still holds the expression it had.
    assertArrayEquals(
      read.RegexPatternSet?.RegularExpressionList.map(
        (expression) => expression.RegexString,
      ),
      ["nikto"],
    );
  });
});
