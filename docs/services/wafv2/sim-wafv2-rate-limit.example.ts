/**
 * Limiting how often one client may ask to create an account.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const waf = simAws.wafV2();

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
        Name: "sign-up-rate",
        Priority: 0,
        Action: { Block: {} },
        Statement: {
          RateBasedStatement: {
            Limit: 10,
            EvaluationWindowSec: 300,
            AggregateKeyType: "IP",
            ScopeDownStatement: {
              ByteMatchStatement: {
                FieldToMatch: { UriPath: {} },
                PositionalConstraint: "STARTS_WITH",
                SearchString: Buffer.from("/signup"),
                TextTransformations: [{ Priority: 0, Type: "LOWERCASE" }],
              },
            },
          },
        },
        VisibilityConfig: { ...visibility, MetricName: "sign-up-rate" },
      },
    ],
  }),
);

const webAclArn = created.Summary!.ARN;

const signUp = (): string =>
  waf.evaluateRequest({
    webAclArn,
    request: new Request("https://pool.example.test/signup"),
  }).action;

const decisions = Array.from({ length: 11 }, signUp);

// "ALLOW" "BLOCK"
console.log(decisions[9], decisions[10]);

const login = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://pool.example.test/login"),
});

// "ALLOW"
console.log(login.action);

await simAws.clock().advanceBy({ minutes: 6 });

// "ALLOW"
console.log(signUp());
