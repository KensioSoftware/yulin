import {
  DescribeManagedRuleGroupCommand,
  type RuleActionOverride,
} from "@aws-sdk/client-wafv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
} from "@kensio/smartass";
import { faker } from "@faker-js/faker";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../command/web-acl/sim-waf-create-web-acl.factory.js";
import { SimWafDeclarationError } from "../error/sim-wafv2.error.js";
import type { SimWafDecision } from "../evaluate/sim-waf-decision.js";
import type { SimWafV2 } from "../sim-wafv2.js";
import {
  createSimWafWebAcl,
  simWafBrowserRequest,
} from "../sim-wafv2.fixture.js";
import {
  simWafManagedRuleFactory,
  simWafRuleFactory,
} from "../web-acl/sim-waf-rule.factory.js";
import type { SimWafRuleInput } from "../web-acl/sim-waf-rule.type.js";

const anonymousIpList = "awswaf:managed:aws:anonymous-ip-list";

/**
 * A rule running the anonymous IP list, with any rule set to another action.
 */
function anonymousIpGroup(
  overrides: readonly RuleActionOverride[] = [],
): SimWafRuleInput {
  return {
    ...simWafManagedRuleFactory.make({ Name: "anonymous-ip" }),
    Statement: {
      ManagedRuleGroupStatement: {
        VendorName: "AWS",
        Name: "AWSManagedRulesAnonymousIpList",
        RuleActionOverrides: overrides,
      },
    },
  };
}

/**
 * What a web ACL decides about a request to the sign-up page from one client
 * address.
 */
type SimWafDecisionFrom = (sourceIp?: string) => SimWafDecision;

/**
 * Create a web ACL holding some rules, and answer with a way to send it a
 * sign-up from one address or another.
 */
async function decisionsFrom(
  waf: SimWafV2,
  rules: readonly SimWafRuleInput[],
): Promise<SimWafDecisionFrom> {
  const { ARN: webAclArn } = await createSimWafWebAcl(waf, {
    ...simWafCreateWebAclFactory.make(),
    Rules: rules,
  });

  return (sourceIp): SimWafDecision =>
    waf.evaluateRequest({
      webAclArn,
      request: simWafBrowserRequest("https://auth.example.test/signup"),
      sourceIp,
    });
}

/**
 * One address inside a Tor exit range a test declares.
 */
const torExit = (): string => `185.220.101.${faker.number.int({ max: 255 })}`;

describe("SimWafV2 managed rules declared by client address", () => {
  it("blocks and labels a request from inside a range declared anonymous", async () => {
    // Given the anonymous IP list, and a Tor exit range declared to be on it.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [anonymousIpGroup()]);

    waf.managedRules().onAddress("185.220.101.0/24", {
      matches: ["AnonymousIPList"],
    });

    // When a sign-up comes from inside the range and one from outside it.
    const fromTor = decide(torExit());
    const fromHome = decide(faker.internet.ipv4({ network: "private-a" }));

    // Then the one from Tor is blocked under the rule's label, and the other
    // is let through with no label at all.
    assertIdentical(fromTor.action, "BLOCK");
    assertIdentical(fromTor.terminatingRuleName, "anonymous-ip");
    assertArrayEquals(fromTor.labels, [`${anonymousIpList}:AnonymousIPList`]);
    assertIdentical(fromHome.action, "ALLOW");
    assertArrayEmpty(fromHome.labels);
  });

  it("blocks a request from one address declared a hosting provider", async () => {
    // Given one address declared to belong to a hosting provider.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [anonymousIpGroup()]);
    const hosted = faker.internet.ipv4();

    waf.managedRules().onAddress(hosted, {
      matches: ["HostingProviderIPList"],
    });

    // When a request comes from it.
    const decision = decide(hosted);

    // Then the hosting provider rule blocks it under its own label.
    assertIdentical(decision.action, "BLOCK");
    assertArrayEquals(decision.labels, [
      `${anonymousIpList}:HostingProviderIPList`,
    ]);
  });

  it("counts a declared address when an override sets its rule to Count", async () => {
    // Given the anonymous IP list tuned to count AnonymousIPList, and a rule
    // of the reader's own blocking on the label it adds.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [
      anonymousIpGroup([
        { Name: "AnonymousIPList", ActionToUse: { Count: {} } },
      ]),
      {
        ...simWafRuleFactory.make({ Name: "block-anonymous-sign-up" }),
        Priority: 1,
        Statement: {
          LabelMatchStatement: {
            Scope: "LABEL",
            Key: `${anonymousIpList}:AnonymousIPList`,
          },
        },
      },
    ]);

    waf.managedRules().onAddress("185.220.101.0/24", {
      matches: ["AnonymousIPList"],
    });

    // When a request comes from the declared range.
    const decision = decide(torExit());

    // Then the group counts it and labels it, and the reader's rule is the
    // one that blocks it.
    assertIdentical(decision.action, "BLOCK");
    assertIdentical(decision.terminatingRuleName, "block-anonymous-sign-up");
    assertArrayEquals(decision.countedRuleNames, ["anonymous-ip"]);
  });

  it("matches an IPv6 range, and no IPv4 address against it", async () => {
    // Given an IPv6 range declared anonymous.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [anonymousIpGroup()]);

    waf.managedRules().onAddress("2001:db8:a::/48", {
      matches: ["AnonymousIPList"],
    });

    // When a request comes from inside it, and one from an IPv4 address.
    const inside = decide("2001:db8:a:1::25");
    const ipv4 = decide(torExit());

    // Then only the one inside the range is blocked.
    assertIdentical(inside.action, "BLOCK");
    assertIdentical(ipv4.action, "ALLOW");
  });

  it("reads a request that states no address as coming from loopback", async () => {
    // Given loopback declared to be on the anonymous list.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [anonymousIpGroup()]);

    waf.managedRules().onAddress("127.0.0.1", {
      matches: ["AnonymousIPList"],
    });

    // When a request naming no address is evaluated.
    const decision = decide();

    // Then it comes from 127.0.0.1 and is blocked.
    assertIdentical(decision.action, "BLOCK");
  });

  it("joins what was declared for a request's address and its path", async () => {
    // Given one address declared anonymous and the sign-up path declared to
    // come from a hosting provider.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [
      anonymousIpGroup([
        { Name: "AnonymousIPList", ActionToUse: { Count: {} } },
        { Name: "HostingProviderIPList", ActionToUse: { Count: {} } },
      ]),
    ]);
    const address = torExit();

    waf.managedRules().onAddress(address, { matches: ["AnonymousIPList"] });
    waf.managedRules().onRequest("/signup", {
      matches: ["HostingProviderIPList"],
    });

    // When a sign-up comes from that address.
    const decision = decide(address);

    // Then both rules label it.
    assertArrayEquals(decision.labels, [
      `${anonymousIpList}:AnonymousIPList`,
      `${anonymousIpList}:HostingProviderIPList`,
    ]);
  });

  it("counts each client address on its own under an IP rate limit", async () => {
    // Given a rate limit of 10 requests per address.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [
      {
        ...simWafRuleFactory.make({ Name: "limit" }),
        Statement: {
          RateBasedStatement: { Limit: 10, AggregateKeyType: "IP" },
        },
      },
    ]);
    const busy = torExit();

    // When one address sends eleven requests and another sends one.
    const busyDecisions = Array.from({ length: 11 }, () => decide(busy));
    const quiet = decide(faker.internet.ipv4({ network: "private-a" }));

    // Then the busy address trips the limit and the quiet one does not.
    assertIdentical(busyDecisions.at(-1)?.action, "BLOCK");
    assertIdentical(quiet.action, "ALLOW");
  });

  it("refuses a match by address for a rule that reads the request", () => {
    // Given a simulated WAFv2.
    const managed = new SimAws().wafV2().managedRules();

    // When a core rule set rule is declared by address.
    const error = assertThrowsError(() => {
      managed.onAddress("185.220.101.0/24", {
        matches: ["CrossSiteScripting_BODY"],
      });
    });

    // Then it is refused, pointing at the path declaration instead.
    assertInstanceOf(error, SimWafDeclarationError);
    assertStringIncludes(error.message, "AWSManagedRulesCommonRuleSet");
    assertStringIncludes(error.message, "onRequest");
  });

  it("refuses an address range that is not one", () => {
    // Given a simulated WAFv2.
    const managed = new SimAws().wafV2().managedRules();

    // When ranges that are no address, and too wide a prefix, are declared.
    const invalid = ["tor-exit", "185.220.101.0/33", "2001:db8::/129", "/24"];

    // Then each is refused with the shape a range takes.
    for (const range of invalid) {
      const error = assertThrowsError(() => {
        managed.onAddress(range, { matches: ["AnonymousIPList"] });
      });

      assertInstanceOf(error, SimWafDeclarationError);
      assertStringIncludes(error.message, "CIDR range");
    }
  });

  it("refuses to evaluate a request from something that is no address", async () => {
    // Given a web ACL.
    const waf = new SimAws().wafV2();
    const decide = await decisionsFrom(waf, [anonymousIpGroup()]);

    // When a request is evaluated as coming from a hostname.
    const error = assertThrowsError(() => decide("tor.example.test"));

    // Then it is refused rather than read as loopback.
    assertInstanceOf(error, SimWafDeclarationError);
    assertStringIncludes(error.message, "tor.example.test");
  });

  it("describes the anonymous IP list's two rules", async () => {
    // Given a simulated WAFv2.
    const waf = new SimAws().wafV2();

    // When the anonymous IP list is described.
    const described = await waf.describeManagedRuleGroup(
      new DescribeManagedRuleGroupCommand({
        VendorName: "AWS",
        Name: "AWSManagedRulesAnonymousIpList",
        Scope: "REGIONAL",
      }),
    );

    // Then it names both rules, each blocking, and both labels.
    assertObjectEquals(
      described.Rules?.map((rule) => [rule.Name, Object.keys(rule.Action)]),
      [
        ["AnonymousIPList", ["Block"]],
        ["HostingProviderIPList", ["Block"]],
      ],
    );
    assertArrayEquals(
      described.AvailableLabels?.map((label) => label.Name),
      [
        `${anonymousIpList}:AnonymousIPList`,
        `${anonymousIpList}:HostingProviderIPList`,
      ],
    );
  });
});
