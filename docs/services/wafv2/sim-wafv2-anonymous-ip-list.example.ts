/**
 * Blocking sign-ups from a Tor exit range with the anonymous IP list.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "pool",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "pool-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "anonymous-ip",
        Priority: 0,
        OverrideAction: { None: {} },
        Statement: {
          ManagedRuleGroupStatement: {
            VendorName: "AWS",
            Name: "AWSManagedRulesAnonymousIpList",
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "anonymous-ip" },
      },
    ],
  }),
);

waf.managedRules().onAddress("185.220.101.0/24", {
  matches: ["AnonymousIPList"],
});

const signUp = (sourceIp: string): string =>
  waf.evaluateRequest({
    webAclArn: created.Summary!.ARN,
    request: new Request("https://myapp-login.example.com/signup", {
      headers: { "user-agent": "Mozilla/5.0" },
    }),
    sourceIp,
  }).action;

// "BLOCK"
console.log(signUp("185.220.101.7"));

// "ALLOW"
console.log(signUp("203.0.113.9"));
