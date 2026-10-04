/**
 * Writing a web ACL with a rule Yulin does not evaluate.
 */

import { CreateWebACLCommand } from "@aws-sdk/client-wafv2";

import { SimAws } from "@kensio/yulin";

const waf = new SimAws().wafV2();

const visibility = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "site",
};

const created = await waf.createWebAcl(
  new CreateWebACLCommand({
    Name: "site-acl",
    Scope: "REGIONAL",
    DefaultAction: { Allow: {} },
    VisibilityConfig: visibility,
    Rules: [
      {
        Name: "bot-control",
        Priority: 0,
        OverrideAction: { Count: {} },
        Statement: {
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
        VisibilityConfig: visibility,
      },
    ],
  }),
);

const [part] = waf.unsimulatedParts(created.Summary!.ARN);

// "Rules.bot-control"
console.log(part?.part);

// "Rule bot-control uses the rule group member ManagedRuleGroupConfigs,
//  which Yulin does not simulate: ..."
console.log(part?.reason);
