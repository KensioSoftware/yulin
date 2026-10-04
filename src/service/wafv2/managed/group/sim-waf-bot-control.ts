import type {
  SimWafManagedRuleDefinition,
  SimWafManagedRuleGroupDefinition,
} from "../sim-waf-managed-rule.type.js";

/**
 * The bot categories Bot Control's common level names, each with the rule
 * that matches an unverified bot of that category.
 *
 * The category is spelled the way the `bot:category:` label spells it, and
 * the rule name is `Category` and the category in Pascal case.
 */
export const simWafBotCategories: ReadonlyMap<string, string> = new Map([
  ["advertising", "CategoryAdvertising"],
  ["archiver", "CategoryArchiver"],
  ["content_fetcher", "CategoryContentFetcher"],
  ["email_client", "CategoryEmailClient"],
  ["http_library", "CategoryHttpLibrary"],
  ["link_checker", "CategoryLinkChecker"],
  ["miscellaneous", "CategoryMiscellaneous"],
  ["monitoring", "CategoryMonitoring"],
  ["page_preview", "CategoryPagePreview"],
  ["scraping_framework", "CategoryScrapingFramework"],
  ["search_engine", "CategorySearchEngine"],
  ["security", "CategorySecurity"],
  ["seo", "CategorySeo"],
  ["social_media", "CategorySocialMedia"],
  ["webhooks", "CategoryWebhooks"],
  ["ai", "CategoryAI"],
]);

/**
 * The one category whose rule matches a verified bot as well.
 */
export const simWafBotCategoryMatchingVerified = "ai";

const signals: readonly (readonly [rule: string, signal: string])[] = [
  ["SignalAutomatedBrowser", "automated_browser"],
  ["SignalKnownBotDataCenter", "known_bot_data_center"],
  ["SignalNonBrowserUserAgent", "non_browser_user_agent"],
];

const categoryRules: readonly SimWafManagedRuleDefinition[] =
  simWafBotCategories
    .entries()
    .map(([category, name]) => ({
      name,
      label: name,
      labels: [`bot:category:${category}`],
      tier: "declared" as const,
    }))
    .toArray();

const signalRules: readonly SimWafManagedRuleDefinition[] = signals.map(
  ([name, signal]) => ({
    name,
    label: name,
    labels: [`signal:${signal}`],
    tier: "declared" as const,
  }),
);

/**
 * AWS WAF Bot Control at its common inspection level.
 *
 * The common level identifies a bot by what the request says about itself,
 * and AWS publishes the rule names, the categories and the labels and none of
 * the signatures. Verifying a bot reads the source address, which is
 * `127.0.0.1` for every request here. So every rule is declared-only, and a
 * test says which bot sent a request with `managedRules().onRequest` and a
 * `bot` declaration.
 *
 * The targeted level is held without being evaluated. Its rules read tokens,
 * browser signals and traffic across requests.
 */
export const simWafBotControlRuleSet: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesBotControlRuleSet",
  labelNamespace: "awswaf:managed:aws:bot-control",
  capacity: 50,
  rules: [...categoryRules, ...signalRules],
};
