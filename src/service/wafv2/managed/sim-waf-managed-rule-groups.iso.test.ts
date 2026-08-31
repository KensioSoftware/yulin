import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsError,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  SimWafDeclarationError,
  SimWafUnsimulatedInputException,
} from "../error/sim-wafv2.error.js";
import {
  simWafBrowserRequest,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import { simWafManagedRuleFactory } from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";

const coreRuleSet = "AWSManagedRulesCommonRuleSet";
const knownBadInputs = "AWSManagedRulesKnownBadInputsRuleSet";
const adminProtection = "AWSManagedRulesAdminProtectionRuleSet";

/**
 * A rule running one managed rule group, counting rather than blocking.
 *
 * Counting is what makes the whole group visible. A blocking group stops at
 * the first rule that claims the request, and a counting one runs every rule
 * and labels the request with each that matched.
 */
function countingGroup(name: string): SimWafRuleInput {
  return {
    ...simWafManagedRuleFactory.make(),
    OverrideAction: { Count: {} },
    Statement: {
      ManagedRuleGroupStatement: { VendorName: "AWS", Name: name },
    },
  };
}

function blockingGroup(name: string): SimWafRuleInput {
  return {
    ...simWafManagedRuleFactory.make({ Name: "managed" }),
    Statement: {
      ManagedRuleGroupStatement: { VendorName: "AWS", Name: name },
    },
  };
}

describe("SimWafV2 AWS managed rule groups", () => {
  it("accepts the three simulated groups", async () => {
    // Given a web ACL running all three groups at once, as a stack turning WAF
    // on tends to.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      { ...blockingGroup(coreRuleSet), Name: "core", Priority: 0 },
      { ...blockingGroup(knownBadInputs), Name: "known-bad", Priority: 1 },
      { ...blockingGroup(adminProtection), Name: "admin", Priority: 2 },
    ]);

    // When ordinary traffic reaches it.
    const decision = decide(
      simWafBrowserRequest("https://example.test/pricing"),
    );

    // Then the web ACL was created and the request went through, which is the
    // whole reason for covering these groups: a stack that turns them on
    // deploys, and its own traffic is not blocked by the rules it turned on.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEmpty(decision.labels);
  });

  it("evaluates a group's rules in the order AWS documents", async () => {
    // Given the core rule set in count mode, so every rule that claims the
    // request gets to run.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      countingGroup(coreRuleSet),
    ]);

    // When a request claimed by two of its rules is evaluated. The path holds
    // a traversal with an encoded slash and a restricted extension, and the
    // extension rule runs first.
    const decision = decide(
      simWafBrowserRequest("https://example.test/..%2fsecret.log"),
    );

    // Then the labels are in the order the group evaluated the rules, which is
    // AWS's order and not the order the rules read in.
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:core-rule-set:RestrictedExtensions_URIPath",
      "awswaf:managed:aws:core-rule-set:GenericLFI_URIPath",
    ]);
  });

  it("blocks by the first rule of the group that claims a request", async () => {
    // Given the core rule set as it comes, which blocks.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      blockingGroup(coreRuleSet),
    ]);

    // When a request two of its rules claim is evaluated.
    const decision = decide(
      simWafBrowserRequest("https://example.test/..%2fsecret.log"),
    );

    // Then the first of them decided, and only its label was added: the group
    // stopped where AWS stops. The rule that decided is the web ACL's own
    // rule, since that is what the group was named by.
    assertIdentical(decision.action, "BLOCK");
    assertIdentical(decision.terminatingRuleName, "managed");
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:core-rule-set:RestrictedExtensions_URIPath",
    ]);
  });

  it("labels a request from the group that claimed it", async () => {
    // Given the known bad inputs group and the admin protection group.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      { ...countingGroup(knownBadInputs), Name: "known-bad", Priority: 0 },
      { ...countingGroup(adminProtection), Name: "admin", Priority: 1 },
    ]);

    // When a request each of them claims is evaluated.
    const decision = decide(
      simWafBrowserRequest("https://example.test/sqlmanager/", {
        method: "PROPFIND",
      }),
    );

    // Then each label names the group it came from, so a rule tuning one group
    // can be written without reaching the other.
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:known-bad-inputs:Propfind_Method",
      "awswaf:managed:aws:admin-protection:AdminProtection_URIPath",
    ]);
  });

  it("refuses a managed rule group that is not simulated", async () => {
    // Given a web ACL naming the bot control group, which decides by behaviour
    // across requests.
    const waf = new SimAws().wafV2();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafWebAclDecisions(waf, [
        blockingGroup("AWSManagedRulesBotControlRuleSet"),
      ]);
    });

    // Then it is refused by name, and the refusal says which groups are
    // simulated rather than leaving a reader to try them.
    assertInstanceOf(error, SimWafUnsimulatedInputException);
    assertStringIncludes(error.message, "AWSManagedRulesBotControlRuleSet");
    assertStringIncludes(error.message, coreRuleSet);
    assertStringIncludes(error.message, knownBadInputs);
    assertStringIncludes(error.message, adminProtection);
  });

  it("refuses a rule group from another vendor", async () => {
    // Given a web ACL naming a marketplace group under the core rule set name.
    const waf = new SimAws().wafV2();

    // When it is created.
    const error = await assertThrowsErrorAsync(async () => {
      await simWafWebAclDecisions(waf, [
        {
          ...simWafManagedRuleFactory.make({ Name: "managed" }),
          Statement: {
            ManagedRuleGroupStatement: {
              VendorName: "Fortinet",
              Name: coreRuleSet,
            },
          },
        },
      ]);
    });

    // Then it is refused: a subscription buys rules nobody outside the vendor
    // has seen.
    assertStringIncludes(error.message, "Fortinet");
  });

  it("reports what it covers of every rule it carries", () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When the managed rules are asked what they cover.
    const rules = waf.managedRules().rules();
    const declared = rules.filter((rule) => rule.tier === "declared");

    // Then every rule of the three groups is reported with its group, its
    // label and its tier, and the rules that detect nothing are the four that
    // run AWS's own cross-site scripting detection.
    assertArrayLength(rules, 34);
    assertArrayEquals(
      declared.map((rule) => rule.name),
      [
        "CrossSiteScripting_COOKIE",
        "CrossSiteScripting_QUERYARGUMENTS",
        "CrossSiteScripting_BODY",
        "CrossSiteScripting_URIPATH",
      ],
    );
    assertIdentical(waf.managedRules().tierOf("NoUserAgent_HEADER"), "exact");
    assertIdentical(
      waf.managedRules().tierOf("GenericLFI_URIPATH"),
      "documented",
    );
    assertTrue(
      rules.every((rule) => rule.label.startsWith("awswaf:managed:aws:")),
    );
  });

  it("blocks a request a test declared a match for", async () => {
    // Given the core rule set, and a test that says the cross-site scripting
    // rule claims one path. AWS documents none of that detection, so nothing
    // here would find the payload on its own.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      blockingGroup(coreRuleSet),
    ]);

    waf.managedRules().onRequest("/search", {
      matches: ["CrossSiteScripting_QUERYARGUMENTS"],
    });

    // When a request to that path is evaluated, and one to another path.
    const attack = decide(
      simWafBrowserRequest("https://example.test/search?q=%3Cscript%3E"),
    );
    const ordinary = decide(
      simWafBrowserRequest("https://example.test/results?q=%3Cscript%3E"),
    );

    // Then the declared match blocked through the rule it named, and the same
    // payload elsewhere went through.
    assertIdentical(attack.action, "BLOCK");
    assertArrayEquals(attack.labels, [
      "awswaf:managed:aws:core-rule-set:CrossSiteScripting_QueryArguments",
    ]);
    assertIdentical(ordinary.action, "ALLOW");
  });

  it("refuses a match declared against a rule no group holds", () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a match is declared against a rule name that is not in any group.
    const error = assertThrowsError(() => {
      waf.managedRules().onRequest("/search", {
        matches: ["CrossSiteScripting_QueryArguments"],
      });
    });

    // Then it is refused where the declaration was written, rather than
    // sitting there matching nothing. The rule names are AWS's own, and the
    // label spelling is not one of them.
    assertInstanceOf(error, SimWafDeclarationError);
    assertStringIncludes(error.message, "CrossSiteScripting_QueryArguments");
  });

  it("refuses a match declared for no path", () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When a match is declared with no path to declare it for.
    const error = assertThrowsError(() => {
      waf.managedRules().onRequest("", { matches: ["PROPFIND_METHOD"] });
    });

    // Then it is refused: a path is what the declaration is matched by.
    assertInstanceOf(error, SimWafDeclarationError);
  });
});
