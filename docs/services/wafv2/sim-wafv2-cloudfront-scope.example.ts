/**
 * Creating a web ACL for a CloudFront distribution.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const waf = simAws
  .accountRegionScope(simAws.defaultAccountId, "us-east-1")
  .wafV2();

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "site-acl",
    Scope: "CLOUDFRONT",
    DefaultAction: { Allow: {} },
    VisibilityConfig: {
      SampledRequestsEnabled: false,
      CloudWatchMetricsEnabled: false,
      MetricName: "site",
    },
  }),
);

// arn:aws:wafv2:us-east-1:...:global/webacl/site-acl/...
console.log(created.Summary?.ARN);
