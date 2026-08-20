/**
 * Blocking a set of user agents held in a regex pattern set.
 */

import {
  CreateRegexPatternSetCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const patternSet = await waf.createRegexPatternSet(
  new CreateRegexPatternSetCommand({
    Name: "scanners",
    Scope: "REGIONAL",
    RegularExpressionList: [
      { RegexString: "sqlmap" },
      { RegexString: "nikto" },
    ],
  }),
);

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
        Name: "block-scanners",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          RegexPatternSetReferenceStatement: {
            ARN: patternSet.Summary!.ARN,
            FieldToMatch: { SingleHeader: { Name: "user-agent" } },
            TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const decision = waf.evaluateRequest({
  webAclArn: created.Summary!.ARN,
  request: new Request("https://example.test/", {
    headers: { "user-agent": "sqlmap/1.7" },
  }),
});

// "BLOCK"
console.log(decision.action);
