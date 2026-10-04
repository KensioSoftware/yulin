import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  simWafHeldWebAcl,
  simWafUnsimulatedReason,
} from "./sim-wafv2.fixture.js";
import type { SimWafStatementInput } from "./statement/sim-waf-statement.type.js";
import type { SimWafRuleInput } from "./web-acl/sim-waf-rule.type.js";
import { simWafRuleFactory } from "./web-acl/sim-waf-rule.factory.js";

const blockingRule = (statement: SimWafStatementInput): SimWafRuleInput => ({
  ...simWafRuleFactory.make({ Name: "the-rule" }),
  Statement: statement,
});

const managedRule = (
  statement: SimWafStatementInput,
  overrideAction: SimWafRuleInput["OverrideAction"],
): SimWafRuleInput => ({
  Name: "the-rule",
  Priority: 0,
  OverrideAction: overrideAction,
  Statement: statement,
  VisibilityConfig: simWafRuleFactory.make().VisibilityConfig,
});

const uriPath = {
  FieldToMatch: { UriPath: {} },
  TextTransformations: [{ Priority: 0, Type: "NONE" }],
};

const byteMatch = (fieldToMatch: object): SimWafStatementInput => ({
  ByteMatchStatement: {
    SearchString: "/",
    PositionalConstraint: "CONTAINS",
    FieldToMatch: fieldToMatch,
    TextTransformations: [{ Priority: 0, Type: "NONE" }],
  },
});

const arn = "arn:aws:wafv2:eu-west-2:111111111111:regional";

describe("SimWafV2 input it does not simulate", () => {
  it.each<[string, SimWafRuleInput, string]>([
    [
      "an IP set",
      blockingRule({ IPSetReferenceStatement: { ARN: `${arn}/ipset/x/y` } }),
      "127.0.0.1",
    ],
    [
      "a country",
      blockingRule({ GeoMatchStatement: { CountryCodes: ["CN"] } }),
      "127.0.0.1",
    ],
    [
      "SQL injection detection",
      blockingRule({ SqliMatchStatement: uriPath }),
      "SqliMatchStatement",
    ],
    [
      "cross-site scripting detection",
      blockingRule({ XssMatchStatement: uriPath }),
      "XssMatchStatement",
    ],
    [
      "a rule group of the reader's own",
      blockingRule({
        RuleGroupReferenceStatement: { ARN: `${arn}/rulegroup/x/y` },
      }),
      "RuleGroupReferenceStatement",
    ],
    [
      "a rate limit on the forwarded address",
      blockingRule({
        RateBasedStatement: { Limit: 100, AggregateKeyType: "FORWARDED_IP" },
      }),
      "FORWARDED_IP",
    ],
    [
      "a rate limit on custom keys",
      blockingRule({
        RateBasedStatement: {
          Limit: 100,
          AggregateKeyType: "CUSTOM_KEYS",
          CustomKeys: [{ Header: { Name: "x-tenant" } }],
        },
      }),
      "CustomKeys",
    ],
    [
      "a parsed JSON body",
      blockingRule(
        byteMatch({
          JsonBody: {
            MatchPattern: { All: {} },
            MatchScope: "VALUE",
            OversizeHandling: "CONTINUE",
          },
        }),
      ),
      "JsonBody",
    ],
    [
      "a TLS fingerprint",
      blockingRule(
        byteMatch({ JA4Fingerprint: { FallbackBehavior: "NO_MATCH" } }),
      ),
      "JA4Fingerprint",
    ],
    [
      "the header order",
      blockingRule(
        byteMatch({ HeaderOrder: { OversizeHandling: "CONTINUE" } }),
      ),
      "HeaderOrder",
    ],
    [
      "a URI fragment",
      blockingRule(
        byteMatch({ UriFragment: { FallbackBehavior: "NO_MATCH" } }),
      ),
      "UriFragment",
    ],
    [
      "a JA3 fingerprint",
      blockingRule(
        byteMatch({ JA3Fingerprint: { FallbackBehavior: "NO_MATCH" } }),
      ),
      "JA3Fingerprint",
    ],
    [
      "a text transformation outside the simulated set",
      blockingRule({
        ByteMatchStatement: {
          SearchString: "/",
          PositionalConstraint: "CONTAINS",
          FieldToMatch: { UriPath: {} },
          TextTransformations: [{ Priority: 0, Type: "BASE64_DECODE" }],
        },
      }),
      "BASE64_DECODE",
    ],
    [
      "a CAPTCHA action",
      { ...blockingRule(byteMatch({ UriPath: {} })), Action: { Captcha: {} } },
      "Captcha",
    ],
    [
      "a Challenge action",
      {
        ...blockingRule(byteMatch({ UriPath: {} })),
        Action: { Challenge: {} },
      },
      "Challenge",
    ],
    [
      "a rule-level CAPTCHA configuration",
      {
        ...blockingRule(byteMatch({ UriPath: {} })),
        CaptchaConfig: { ImmunityTimeProperty: { ImmunityTime: 300 } },
      },
      "CaptchaConfig",
    ],
    [
      "Bot Control, counting",
      managedRule(
        {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesBotControlRuleSet",
            ManagedRuleGroupConfigs: [
              {
                AWSManagedRulesBotControlRuleSet: { InspectionLevel: "COMMON" },
              },
            ],
          },
        },
        { Count: {} },
      ),
      "ManagedRuleGroupConfigs",
    ],
    [
      "the Amazon IP reputation list",
      managedRule(
        {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesAmazonIpReputationList",
          },
        },
        { None: {} },
      ),
      "AWSManagedRulesCommonRuleSet",
    ],
    [
      "a rule group from another vendor",
      managedRule(
        {
          ManagedRuleGroupStatement: {
            VendorName: "Fortinet",
            Name: "AWSManagedRulesCommonRuleSet",
          },
        },
        { None: {} },
      ),
      "Fortinet",
    ],
  ])(
    "holds a rule using %s and claims no request with it",
    async (_, rule, reason) => {
      // When a web ACL is created with a rule that blocks on something Yulin
      // does not simulate.
      const { webAcl, parts, blocked } = await simWafHeldWebAcl(
        new SimAws().wafV2(),
        {
          Rules: [rule],
        },
      );

      // Then the write succeeds and GetWebACL returns the rule as written.
      assertIdentical(webAcl.Rules[0], rule);

      // And the rule is reported by name, with the reason it claims nothing.
      assertStringIncludes(
        simWafUnsimulatedReason(parts, "Rules.the-rule"),
        reason,
      );

      // And a request it might have blocked on AWS goes through.
      assertFalse(blocked);
    },
  );
});
