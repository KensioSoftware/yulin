/**
 * Answering a blocked request with a body the web ACL holds.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";
import { simWafBlockedHttpResponse } from "@kensio/yulin/wafv2";

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
    CustomResponseBodies: {
      "not-here": {
        ContentType: "APPLICATION_JSON",
        Content: '{"message":"Not found"}',
      },
    },
    Rules: [
      {
        Name: "hide-admin",
        Priority: 0,
        Action: {
          Block: {
            CustomResponse: {
              ResponseCode: 404,
              CustomResponseBodyKey: "not-here",
              ResponseHeaders: [{ Name: "rule", Value: "hide-admin" }],
            },
          },
        },
        Statement: {
          ByteMatchStatement: {
            FieldToMatch: { UriPath: {} },
            PositionalConstraint: "STARTS_WITH",
            SearchString: Buffer.from("/admin"),
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
  request: new Request("https://example.test/admin"),
});
const response = simWafBlockedHttpResponse(decision.blocked!);

// 404 "hide-admin" '{"message":"Not found"}'
console.log(
  response.status,
  response.headers.get("x-amzn-waf-rule"),
  await response.text(),
);
