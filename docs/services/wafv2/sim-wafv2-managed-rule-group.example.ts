/**
 * Running the AWS core rule set over an application's own traffic.
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
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesCommonRuleSet",
            RuleActionOverrides: [
              { Name: "NoUserAgent_HEADER", ActionToUse: { Count: {} } },
            ],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const healthCheck = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/health"),
});
const traversal = waf.evaluateRequest({
  webAclArn,
  request: new Request(
    "https://example.test/read?file=..%2F..%2Fetc%2Fpasswd",
    {
      headers: { "user-agent": "curl/8.5.0" },
    },
  ),
});

// "ALLOW" ["awswaf:managed:aws:core-rule-set:NoUserAgent_Header"]
console.log(healthCheck.action, healthCheck.labels);

// "BLOCK" "core-rule-set"
console.log(traversal.action, traversal.terminatingRuleName);
