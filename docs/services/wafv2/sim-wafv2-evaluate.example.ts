/**
 * Blocking requests to an admin path with a simulated web ACL.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "api-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "api",
    },
    Rules: [
      {
        Name: "block-admin",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "STARTS_WITH",
            SearchString: Buffer.from("/admin"),
            TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
          },
        },
        VisibilityConfig: {
          SampledRequestsEnabled: false,
          CloudWatchMetricsEnabled: false,
          MetricName: "block-admin",
        },
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const blocked = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/admin/users"),
});
const allowed = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/"),
});

// "BLOCK" "block-admin" 403
console.log(
  blocked.action,
  blocked.terminatingRuleName,
  blocked.blocked?.statusCode,
);

// "ALLOW" undefined
console.log(allowed.action, allowed.terminatingRuleName);
