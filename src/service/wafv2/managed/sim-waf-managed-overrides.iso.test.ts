import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";
import {
  simWafBrowserRequest,
  type SimWafRequestDecision,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import { simWafRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import { simWafManagedRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";
import type { SimWafManagedRuleGroupStatementInput } from "./sim-waf-managed-group.type.js";

/**
 * A web ACL whose one rule runs the core rule set, written as the statement
 * says.
 */
async function coreRuleSet(
  statement: SimWafManagedRuleGroupStatementInput = {},
  rule: Partial<SimWafRuleInput> = {},
): Promise<SimWafRequestDecision> {
  return await simWafWebAclDecisions(new SimAws().wafV2(), [
    {
      ...simWafManagedRuleFactory.make({ Name: "core" }),
      ...rule,
      Statement: {
        ManagedRuleGroupStatement: {
          VendorName: "AWS",
          Name: "AWSManagedRulesCommonRuleSet",
          ...statement,
        },
      },
    },
  ]);
}

/**
 * Try to create a web ACL holding one rule, and answer with the refusal.
 */
async function refusalForRule(rule: SimWafRuleInput): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await simWafWebAclDecisions(new SimAws().wafV2(), [rule]);
  });
}

/**
 * Try to create a web ACL running the core rule set as the statement says, and
 * answer with the refusal.
 */
async function refusalForGroup(
  statement: SimWafManagedRuleGroupStatementInput,
): Promise<Error> {
  return await refusalForRule({
    ...simWafManagedRuleFactory.make({ Name: "core" }),
    Statement: {
      ManagedRuleGroupStatement: {
        VendorName: "AWS",
        Name: "AWSManagedRulesCommonRuleSet",
        ...statement,
      },
    },
  });
}

describe("SimWafV2 managed rule group overrides", () => {
  it("sets a named rule to count", async () => {
    // Given the core rule set with the user agent rule set to count, which is
    // what a team does when their own health check sends no headers.
    const decide = await coreRuleSet({
      RuleActionOverrides: [
        { Name: "NoUserAgent_HEADER", ActionToUse: { Count: {} } },
      ],
    });

    // When a request with no User-Agent header is evaluated.
    const decision = decide(new Request("https://example.test/health"));

    // Then it goes through, the group is recorded as having counted, and the
    // label is there for a rule of the reader's own to read.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.countedRuleNames, ["core"]);
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:core-rule-set:NoUserAgent_Header",
    ]);
  });

  it("leaves the rules it did not name alone", async () => {
    // Given the core rule set with only the user agent rule set to count.
    const decide = await coreRuleSet({
      RuleActionOverrides: [
        { Name: "NoUserAgent_HEADER", ActionToUse: { Count: {} } },
      ],
    });

    // When a request with no User-Agent asks for a configuration file, which
    // a rule further down the group claims.
    const decision = decide(new Request("https://example.test/app.ini"));

    // Then the counted rule labelled the request and the group carried on to
    // the rule that still blocks.
    assertIdentical(decision.action, "BLOCK");
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:core-rule-set:NoUserAgent_Header",
      "awswaf:managed:aws:core-rule-set:RestrictedExtensions_URIPath",
    ]);
  });

  it("holds the whole group to counting", async () => {
    // Given the core rule set with the group's own override action set to
    // count, and one rule inside it set to block.
    const decide = await coreRuleSet(
      {
        RuleActionOverrides: [
          { Name: "NoUserAgent_HEADER", ActionToUse: { Block: {} } },
        ],
      },
      { OverrideAction: { Count: {} } },
    );

    // When a request that rule claims is evaluated.
    const decision = decide(new Request("https://example.test/health"));

    // Then nothing was blocked. A group override holds the group to counting
    // whatever its rules were set to, so it cannot decide a request.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.countedRuleNames, ["core"]);
  });

  it("shows a group only the requests a scope-down statement claims", async () => {
    // Given the core rule set narrowed to the API paths.
    const decide = await coreRuleSet({
      ScopeDownStatement: {
        ByteMatchStatement: {
          SearchString: "/api/",
          PositionalConstraint: "STARTS_WITH",
          FieldToMatch: { UriPath: {} },
          TextTransformations: [{ Priority: 0, Type: "NONE" }],
        },
      },
    });

    // When a traversal arrives inside those paths, and the same one outside
    // them.
    const inside = decide(
      simWafBrowserRequest("https://example.test/api/read?file=..%2Fetc"),
    );
    const outside = decide(
      simWafBrowserRequest("https://example.test/docs/read?file=..%2Fetc"),
    );

    // Then the group only saw the first. The second picked up no label at all,
    // because the group never ran over it.
    assertIdentical(inside.action, "BLOCK");
    assertIdentical(outside.action, "ALLOW");
    assertArrayLength(outside.labels, 0);
  });

  it("refuses an override naming a rule the group does not hold", async () => {
    // When a rule group override names a rule from another group.
    const error = await refusalForGroup({
      RuleActionOverrides: [
        { Name: "Log4JRCE_HEADER", ActionToUse: { Count: {} } },
      ],
    });

    // Then it is refused. A name that matched nothing would leave the rule it
    // meant to reach still blocking, which is the failure overrides exist to
    // avoid.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "Log4JRCE_HEADER");
  });

  it("refuses a rule that names a group and carries an action", async () => {
    // When a rule names a rule group and an action of its own.
    const error = await refusalForRule({
      ...simWafManagedRuleFactory.make({ Name: "core" }),
      Action: { Block: {} },
    });

    // Then it is refused, as real WAFv2 refuses it: the action comes from the
    // rule inside the group that claimed the request.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "OverrideAction");
  });

  it("refuses a rule that names a group and no override action", async () => {
    // When a rule names a rule group with neither None nor Count.
    const error = await refusalForRule({
      ...simWafManagedRuleFactory.make({ Name: "core" }),
      OverrideAction: {},
    });

    // Then it is refused rather than read as a group that overrides nothing.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "None or Count");
  });

  it("refuses an override action on a rule that names no group", async () => {
    // When an ordinary rule carries an override action.
    const error = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "block-admin" }),
      OverrideAction: { Count: {} },
    });

    // Then it is refused: an override action applies to a rule group and
    // there is none here to apply it to.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "block-admin");
  });

  it("refuses the rule group members this simulation does not model", async () => {
    // When a rule group names a published version, excludes rules the
    // deprecated way, or configures one of the groups that is not simulated.
    const version = await refusalForGroup({ Version: "Version_1.9" });
    const excluded = await refusalForGroup({
      ExcludedRules: [{ Name: "NoUserAgent_HEADER" }],
    });
    const configs = await refusalForGroup({
      ManagedRuleGroupConfigs: [{ LoginPath: "/login" }],
    });

    // Then each is refused by name, and the exclusion says what replaced it.
    assertInstanceOf(version, SimWafUnsimulatedInputException);
    assertStringIncludes(version.message, "Version");
    assertStringIncludes(excluded.message, "RuleActionOverrides");
    assertStringIncludes(configs.message, "ManagedRuleGroupConfigs");
  });

  it("refuses a rule group nested inside another statement", async () => {
    // When a rule joins a rule group to a statement of its own.
    const error = await refusalForRule({
      ...simWafRuleFactory.make({ Name: "core" }),
      Statement: {
        AndStatement: {
          Statements: [
            {
              ByteMatchStatement: {
                SearchString: "/api/",
                PositionalConstraint: "STARTS_WITH",
                FieldToMatch: { UriPath: {} },
                TextTransformations: [{ Priority: 0, Type: "NONE" }],
              },
            },
            {
              ManagedRuleGroupStatement: {
                VendorName: "AWS",
                Name: "AWSManagedRulesCommonRuleSet",
              },
            },
          ],
        },
      },
    });

    // Then it is refused, as real WAFv2 refuses it. A scope-down statement is
    // how a group is narrowed to some of the traffic.
    assertInstanceOf(error, SimWafInvalidParameterException);
    assertStringIncludes(error.message, "ManagedRuleGroupStatement");
  });
});
