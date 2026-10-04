import { DescribeManagedRuleGroupCommand } from "@aws-sdk/client-wafv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayIncludesAll,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import {
  simWafBrowserRequest,
  simWafHeldWebAcl,
  simWafUnsimulatedReason,
  simWafWebAclDecisions,
} from "../sim-wafv2.fixture.js";
import {
  simWafManagedRuleFactory,
  simWafRuleFactory,
} from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";
import type { SimWafManagedRuleGroupStatementInput } from "./sim-waf-managed-group.type.js";

const botControl = "awswaf:managed:aws:bot-control";

/**
 * A rule running one AWS managed rule group as it comes.
 */
function group(
  statement: SimWafManagedRuleGroupStatementInput,
  rule: Partial<SimWafRuleInput> = {},
): SimWafRuleInput {
  return {
    ...simWafManagedRuleFactory.make({ Name: "managed" }),
    ...rule,
    Statement: {
      ManagedRuleGroupStatement: { VendorName: "AWS", ...statement },
    },
  };
}

/**
 * Bot Control at the common inspection level.
 */
function botControlGroup(
  statement: Partial<SimWafManagedRuleGroupStatementInput> = {},
  rule: Partial<SimWafRuleInput> = {},
): SimWafRuleInput {
  return group(
    {
      Name: "AWSManagedRulesBotControlRuleSet",
      ManagedRuleGroupConfigs: [
        { AWSManagedRulesBotControlRuleSet: { InspectionLevel: "COMMON" } },
      ],
      ...statement,
    },
    rule,
  );
}

const search = (): Request =>
  simWafBrowserRequest("https://example.test/search");

describe("SimWafV2 managed rule groups that read the caller", () => {
  it("blocks and labels a request declared to come from a reputation-listed address", async () => {
    // Given a web ACL running the Amazon IP reputation list, and a request to
    // /search declared to match its main rule.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      group({ Name: "AWSManagedRulesAmazonIpReputationList" }),
    ]);

    waf.managedRules().onRequest("/search", {
      matches: ["AWSManagedIPReputationList"],
    });

    // When the declared request and an undeclared one are evaluated.
    const listed = decide(search());
    const other = decide(simWafBrowserRequest("https://example.test/"));

    // Then the declared one is blocked and labelled, and the other passes.
    assertIdentical(listed.action, "BLOCK");
    assertArrayEquals(listed.labels, [
      "awswaf:managed:aws:amazon-ip-list:AWSManagedIPReputationList",
    ]);
    assertIdentical(other.action, "ALLOW");
  });

  it("counts a request on the DDoS list, as AWS ships that rule", async () => {
    // Given the reputation list and a request declared to be on its DDoS list.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      group({ Name: "AWSManagedRulesAmazonIpReputationList" }),
    ]);

    waf.managedRules().onRequest("/search", {
      matches: ["AWSManagedIPDDoSList"],
    });

    // When it is evaluated.
    const decision = decide(search());

    // Then it is labelled and let through.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.countedRuleNames, ["managed"]);
  });

  it("blocks a request declared to come from a hosting provider", async () => {
    // Given the anonymous IP list and a request declared to match it.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      group({ Name: "AWSManagedRulesAnonymousIpList" }),
    ]);

    waf.managedRules().onRequest("/search", {
      matches: ["HostingProviderIPList"],
    });

    // When it is evaluated.
    const decision = decide(search());

    // Then the rule blocks it under its own label.
    assertIdentical(decision.action, "BLOCK");
    assertArrayEquals(decision.labels, [
      "awswaf:managed:aws:anonymous-ip-list:HostingProviderIPList",
    ]);
  });

  it("blocks an unverified bot by its category and labels what it is", async () => {
    // Given Bot Control and a request declared to come from a scraper.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [botControlGroup()]);

    waf.managedRules().onRequest("/search", {
      bot: { category: "scraping_framework", name: "scrapy" },
    });

    // When it is evaluated.
    const decision = decide(search());

    // Then CategoryScrapingFramework blocks it, and the labels say which bot
    // it was and that it was not verified.
    assertIdentical(decision.action, "BLOCK");
    assertArrayIncludesAll(decision.labels, [
      `${botControl}:bot:category:scraping_framework`,
      `${botControl}:bot:name:scrapy`,
      `${botControl}:bot:unverified`,
      `${botControl}:CategoryScrapingFramework`,
    ]);
  });

  it("labels a verified bot and lets it through", async () => {
    // Given Bot Control and a request declared to come from a verified
    // search engine crawler.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [botControlGroup()]);

    waf.managedRules().onRequest("/search", {
      bot: {
        category: "search_engine",
        name: "googlebot",
        organization: "google",
        verified: true,
      },
    });

    // When it is evaluated.
    const decision = decide(search());

    // Then no rule matches, and the labels say what it was.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEmpty(decision.countedRuleNames);
    assertArrayEquals(decision.labels, [
      `${botControl}:bot:category:search_engine`,
      `${botControl}:bot:name:googlebot`,
      `${botControl}:bot:organization:google`,
      `${botControl}:bot:verified`,
    ]);
  });

  it("blocks a verified AI bot, as AWS applies CategoryAI to verified bots too", async () => {
    // Given Bot Control and a request declared to come from a verified AI bot.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [botControlGroup()]);

    waf.managedRules().onRequest("/search", {
      bot: { category: "ai", verified: true },
    });

    // When it is evaluated, then CategoryAI blocks it.
    assertIdentical(decide(search()).terminatingRuleName, "managed");
  });

  it("counts by default without the configuration naming the level", async () => {
    // Given Bot Control written with no ManagedRuleGroupConfigs, counting.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      botControlGroup(
        { ManagedRuleGroupConfigs: undefined },
        { OverrideAction: { Count: {} } },
      ),
    ]);

    waf.managedRules().onRequest("/search", {
      bot: { category: "http_library" },
    });

    // When an unverified HTTP library is evaluated, then the group counts it.
    const decision = decide(search());

    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.countedRuleNames, ["managed"]);
  });

  it("lets a rule of the reader's own block on what a counting group labelled", async () => {
    // Given Bot Control counting, and a rule after it blocking every
    // unverified bot, which is how a site tunes it.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      botControlGroup({}, { OverrideAction: { Count: {} } }),
      {
        ...simWafRuleFactory.make({ Name: "block-unverified", Priority: 1 }),
        Statement: {
          LabelMatchStatement: {
            Scope: "LABEL",
            Key: `${botControl}:bot:unverified`,
          },
        },
      },
    ]);

    waf.managedRules().onRequest("/search", {
      bot: { category: "scraping_framework" },
    });
    waf.managedRules().onRequest("/", {
      bot: { category: "search_engine", verified: true },
    });

    // When an unverified and a verified bot are evaluated.
    const unverified = decide(search());
    const verified = decide(simWafBrowserRequest("https://example.test/"));

    // Then the reader's rule blocks the first and lets the second through.
    assertIdentical(unverified.terminatingRuleName, "block-unverified");
    assertIdentical(verified.action, "ALLOW");
  });

  it("labels the signal a declared signal rule found", async () => {
    // Given Bot Control and a request declared to carry a non-browser agent.
    const waf = new SimAws().wafV2();
    const decide = await simWafWebAclDecisions(waf, [
      botControlGroup({
        RuleActionOverrides: [
          { Name: "SignalNonBrowserUserAgent", ActionToUse: { Count: {} } },
        ],
      }),
    ]);

    waf.managedRules().onRequest("/search", {
      matches: ["SignalNonBrowserUserAgent"],
    });

    // When it is evaluated.
    const decision = decide(search());

    // Then the override counts it, and both labels are added.
    assertIdentical(decision.action, "ALLOW");
    assertArrayEquals(decision.labels, [
      `${botControl}:SignalNonBrowserUserAgent`,
      `${botControl}:signal:non_browser_user_agent`,
    ]);
  });

  it.each<[string, readonly unknown[]]>([
    ["a null entry", [null]],
    [
      "an entry carrying another member beside Bot Control's",
      [
        {
          AWSManagedRulesBotControlRuleSet: { InspectionLevel: "COMMON" },
          LoginPath: "/login",
        },
      ],
    ],
  ])("holds Bot Control configured with %s", async (_, configs) => {
    // When Bot Control is written with a configuration that is not Bot
    // Control at COMMON and nothing else.
    const waf = new SimAws().wafV2();
    const { parts } = await simWafHeldWebAcl(waf, {
      Rules: [botControlGroup({ ManagedRuleGroupConfigs: configs })],
    });

    // Then the rule is held, rather than read as COMMON or failing the write.
    assertStringIncludes(
      simWafUnsimulatedReason(parts, "Rules.managed"),
      "ManagedRuleGroupConfigs",
    );
  });

  it("refuses a bot category Bot Control does not name", () => {
    // When a bot is declared under a category AWS does not use.
    const error = assertThrowsError(() => {
      new SimAws()
        .wafV2()
        .managedRules()
        .onRequest("/search", {
          bot: { category: "crawler" },
        });
    });

    // Then the declaration is refused, naming the categories there are.
    assertInstanceOf(error, SimWafDeclarationError);
  });

  it("describes the DDoS list rule as counting", async () => {
    // When the reputation list is described.
    const described = await new SimAws().wafV2().describeManagedRuleGroup(
      new DescribeManagedRuleGroupCommand({
        VendorName: "AWS",
        Name: "AWSManagedRulesAmazonIpReputationList",
        Scope: "REGIONAL",
      }),
    );

    // Then its rules carry the actions AWS ships them with.
    assertObjectEquals(
      Object.fromEntries(
        (described.Rules ?? []).map((rule) => [rule.Name, rule.Action]),
      ),
      {
        AWSManagedIPReputationList: { Block: {} },
        AWSManagedReconnaissanceList: { Block: {} },
        AWSManagedIPDDoSList: { Count: {} },
      },
    );
  });
});
