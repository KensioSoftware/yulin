/**
 * Staging a rule in count mode before turning it on.
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
        Name: "watch-uploads",
        Priority: 0,
        Action: { Count: {} },
        Statement: {
          SizeConstraintStatement: {
            FieldToMatch: { Body: { OversizeHandling: "CONTINUE" } },
            ComparisonOperator: "GT",
            Size: 1024,
            TextTransformations: [{ Priority: 0, Type: "NONE" }],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/upload", { method: "POST" }),
  body: new TextEncoder().encode("x".repeat(2048)),
});

// "ALLOW" [ 'watch-uploads' ]
console.log(decision.action, decision.countedRuleNames);
