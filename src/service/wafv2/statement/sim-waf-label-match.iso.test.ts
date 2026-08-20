import {
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimWafInvalidParameterException } from "../error/sim-wafv2.error.js";
import {
  simWafBrowserRequest,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import { simWafManagedRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import { simWafRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";

/**
 * A rule that claims requests to one path and labels them.
 */
function labelling(
  name: string,
  priority: number,
  path: string,
  labels: readonly string[],
): SimWafRuleInput {
  return {
    ...simWafRuleFactory.make({ Name: name, Priority: priority }),
    Action: { Count: {} },
    RuleLabels: labels.map((label) => ({ Name: label })),
    Statement: {
      ByteMatchStatement: {
        SearchString: path,
        PositionalConstraint: "STARTS_WITH",
        FieldToMatch: { UriPath: {} },
        TextTransformations: [{ Priority: 0, Type: "NONE" }],
      },
    },
  };
}

/**
 * A rule that blocks whatever a label match claims.
 */
function blockingOn(
  priority: number,
  statement: SimWafStatementInput,
): SimWafRuleInput {
  return {
    ...simWafRuleFactory.make({ Name: "block-labelled", Priority: priority }),
    Action: { Block: {} },
    Statement: statement,
  };
}

describe("SimWafV2 label matching", () => {
  it("blocks on a label an earlier rule added", async () => {
    // Given a rule that labels the requests it counts, and a rule after it
    // that blocks on the label.
    const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
      labelling("watch-admin", 0, "/admin", ["internal-only"]),
      blockingOn(1, {
        LabelMatchStatement: { Scope: "LABEL", Key: "internal-only" },
      }),
    ]);

    // When a labelled request is evaluated, and one the first rule did not
    // claim.
    const labelled = decide(simWafBrowserRequest("https://example.test/admin"));
    const other = decide(simWafBrowserRequest("https://example.test/pricing"));

    // Then the label decided the first and the second went through. A label a
    // rule of the web ACL's own adds carries no prefix, which is what the key
    // is written to match.
    assertIdentical(labelled.action, "BLOCK");
    assertIdentical(labelled.terminatingRuleName, "block-labelled");
    assertArrayEquals(labelled.labels, ["internal-only"]);
    assertIdentical(other.action, "ALLOW");
  });

  it("reads only the labels the rules before it added", async () => {
    // Given a rule that blocks on a label, ahead of the rule that adds it.
    const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
      blockingOn(0, {
        LabelMatchStatement: { Scope: "LABEL", Key: "internal-only" },
      }),
      labelling("watch-admin", 1, "/admin", ["internal-only"]),
    ]);

    // When a request the labelling rule claims is evaluated.
    const decision = decide(simWafBrowserRequest("https://example.test/admin"));

    // Then it went through. Labels arrive as rules run, so a rule at a lower
    // priority than the one that labels a request never sees the label.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.labels, ["internal-only"]);
  });

  it("blocks on any label a managed rule group added", async () => {
    // Given the core rule set counting rather than blocking, and a rule after
    // it that blocks on anything the group claimed. This is the pattern teams
    // tune a managed group with.
    const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
      {
        ...simWafManagedRuleFactory.make({ Name: "core", Priority: 0 }),
        OverrideAction: { Count: {} },
      },
      blockingOn(1, {
        LabelMatchStatement: {
          Scope: "NAMESPACE",
          Key: "awswaf:managed:aws:core-rule-set:",
        },
      }),
    ]);

    // When a request the group claims is evaluated, and one it does not.
    const claimed = decide(
      simWafBrowserRequest("https://example.test/app.ini"),
    );
    const ordinary = decide(simWafBrowserRequest("https://example.test/app"));

    // Then the reader's own rule is what blocked, from a label the group left
    // behind rather than from a rule of the group's.
    assertIdentical(claimed.action, "BLOCK");
    assertIdentical(claimed.terminatingRuleName, "block-labelled");
    assertIdentical(ordinary.action, "ALLOW");
  });

  it("reads a namespace written without its trailing colon", async () => {
    // Given a rule blocking on a namespace key that stops short of the colon.
    const decide = await simWafWebAclDecisions(new SimAws().wafV2(), [
      {
        ...simWafManagedRuleFactory.make({ Name: "core", Priority: 0 }),
        OverrideAction: { Count: {} },
      },
      blockingOn(1, {
        LabelMatchStatement: {
          Scope: "NAMESPACE",
          Key: "awswaf:managed:aws:core-rule-set",
        },
      }),
    ]);

    // When a request the group claims is evaluated.
    const decision = decide(
      simWafBrowserRequest("https://example.test/app.ini"),
    );

    // Then the key is read as the namespace it names, so a group whose name
    // merely started the same way would not be matched by it.
    assertIdentical(decision.action, "BLOCK");
  });

  it("refuses a label match with nothing to match", async () => {
    // When a label match names no key, and when it names a scope that is
    // neither of the two.
    const noKey = await assertThrowsErrorAsync(async () => {
      await simWafWebAclDecisions(new SimAws().wafV2(), [
        blockingOn(0, { LabelMatchStatement: { Scope: "LABEL" } }),
      ]);
    });
    const badScope = await assertThrowsErrorAsync(async () => {
      await simWafWebAclDecisions(new SimAws().wafV2(), [
        blockingOn(0, {
          LabelMatchStatement: { Scope: "PREFIX", Key: "internal-only" },
        }),
      ]);
    });

    // Then each is refused where the rule was written.
    assertInstanceOf(noKey, SimWafInvalidParameterException);
    assertStringIncludes(noKey.message, "Key");
    assertStringIncludes(badScope.message, "LABEL or NAMESPACE");
  });

  it("refuses a rule label with no name", async () => {
    // When a rule adds a label that names nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafWebAclDecisions(new SimAws().wafV2(), [
        { ...labelling("watch-admin", 0, "/admin", []), RuleLabels: [{}] },
      ]);
    });

    // Then it is refused, rather than labelling requests with nothing.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "watch-admin");
  });
});
