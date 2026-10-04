/**
 * Counting with Bot Control and blocking unverified bots by label.
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
      {
        Name: "block-scrapers",
        Priority: 1,
        Action: { Block: {} },
        Statement: {
          LabelMatchStatement: {
            Scope: "LABEL",
            Key: "awswaf:managed:aws:bot-control:bot:category:scraping_framework",
          },
        },
        VisibilityConfig: visibility,
      },
    ],
  }),
);

waf.managedRules().onRequest("/search", {
  bot: { category: "scraping_framework", name: "scrapy" },
});
waf.managedRules().onRequest("/", {
  bot: { category: "search_engine", name: "googlebot", verified: true },
});

const webAclArn = created.Summary!.ARN;

const scraper = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/search"),
});
const crawler = waf.evaluateRequest({
  webAclArn,
  request: new Request("https://example.test/"),
});

// "BLOCK" "block-scrapers"
console.log(scraper.action, scraper.terminatingRuleName);

// "ALLOW" true
console.log(
  crawler.action,
  crawler.labels.includes("awswaf:managed:aws:bot-control:bot:verified"),
);
