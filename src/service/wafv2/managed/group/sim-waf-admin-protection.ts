import { simWafInUriPath } from "../detect/sim-waf-managed-components.js";
import { simWafDetectsAdminPath } from "../detect/sim-waf-managed-patterns.js";
import type { SimWafManagedRuleGroupDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The AWS admin protection rule set, which is one rule that blocks by default.
 *
 * It keeps external callers off the administrative pages third-party software
 * exposes. What it matches is a published example and no more, so an
 * application's own administrative paths reach it here as they do on AWS.
 */
export const simWafAdminProtectionRuleSet: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesAdminProtectionRuleSet",
  labelNamespace: "awswaf:managed:aws:admin-protection",
  capacity: 100,
  rules: [
    {
      name: "AdminProtection_URIPATH",
      label: "AdminProtection_URIPath",
      tier: "documented",
      detects: simWafInUriPath(simWafDetectsAdminPath),
    },
  ],
};
