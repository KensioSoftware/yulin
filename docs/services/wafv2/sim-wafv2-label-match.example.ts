/**
 * Blocking on a label the core rule set left behind.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "api",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "core-rule-set",
        Priority: 0,
        OverrideAction: { Count: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
          },
        },
        VisibilityConfig: visibility,
      },
      {
        Name: "block-restricted-files",
        Priority: 1,
        Action: { Block: {} },
        Statement: {
          LabelMatchStatement: {
            Scope: "LABEL",
            Key: "awswaf:managed:aws:core-rule-set:RestrictedExtensions_URIPath",
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/app.ini", {
    headers: { "user-agent": "curl/8.5.0" },
  }),
});

// "BLOCK" "block-restricted-files"
console.log(decision.action, decision.terminatingRuleName);
