import { faker } from "@faker-js/faker";
import { DynamicFactory } from "@kensio/part-factory";

import type { SimWafRuleInput } from "./sim-waf-rule.type.js";

/**
 * The visibility configuration every WAFv2 rule and web ACL carries.
 *
 * Nothing is emitted from it: web ACL metrics and sampled requests are not
 * simulated. It is here because real WAFv2 asks for one on every rule, so a
 * rule written without it is not a rule anyone would write.
 */
export const simWafVisibilityConfig = {
  SampledRequestsEnabled: false,
  CloudWatchMetricsEnabled: false,
  MetricName: "sim",
};

/**
 * Makes minimally valid WAFv2 rules that block every request.
 *
 * The statement claims any request, so a test about the order rules run in
 * says nothing about matching.
 *
 * `Statement` and `Action` are replaced whole rather than overridden, because
 * overrides are merged into the defaults and both of these are one-of: a
 * statement naming two kinds, or an action naming both `Allow` and `Block`, is
 * not something WAF would take, and is refused where the rule is written.
 */
export const simWafRuleFactory = new DynamicFactory<SimWafRuleInput>(() => ({
  Name: `rule-${faker.string.alphanumeric(8)}`,
  Priority: 0,
  Action: { Block: {} },
  Statement: {
    ByteMatchStatement: {
      SearchString: "/",
      PositionalConstraint: "CONTAINS",
      FieldToMatch: { UriPath: {} },
      TextTransformations: [{ Priority: 0, Type: "NONE" }],
    },
  },
  VisibilityConfig: simWafVisibilityConfig,
}));

/**
 * Makes rules that run the AWS core rule set as it comes.
 *
 * `Statement` and `OverrideAction` are replaced whole rather than overridden,
 * for the reason the statement of any other rule is: each of them holds one
 * thing at a time, and a merge would leave a rule naming two.
 *
 * A rule that names a rule group carries an `OverrideAction` where any other
 * rule carries an `Action`, since what it does to a request comes from
 * whichever rule inside the group claimed it.
 */
export const simWafManagedRuleFactory = new DynamicFactory<SimWafRuleInput>(
  () => ({
    Name: `managed-${faker.string.alphanumeric(8)}`,
    Priority: 0,
    OverrideAction: { None: {} },
    Statement: {
      ManagedRuleGroupStatement: {
        VendorName: "AWS",
        Name: "AWSManagedRulesCommonRuleSet",
      },
    },
    VisibilityConfig: simWafVisibilityConfig,
  }),
);
