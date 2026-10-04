import type { SimWafManagedRuleGroupDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The Amazon IP reputation list, which decides by the address a request came
 * from.
 *
 * Every request in this simulation reports a source address of `127.0.0.1`,
 * so every rule here is declared-only. A test says which requests come from a
 * flagged address with `managedRules().onRequest`, and the group labels and
 * acts on them as AWS documents.
 */
export const simWafIpReputationList: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesAmazonIpReputationList",
  labelNamespace: "awswaf:managed:aws:amazon-ip-list",
  capacity: 25,
  rules: [
    {
      name: "AWSManagedIPReputationList",
      label: "AWSManagedIPReputationList",
      tier: "declared",
    },
    {
      name: "AWSManagedReconnaissanceList",
      label: "AWSManagedReconnaissanceList",
      tier: "declared",
    },
    {
      name: "AWSManagedIPDDoSList",
      label: "AWSManagedIPDDoSList",
      counts: true,
      tier: "declared",
    },
  ],
};

/**
 * The anonymous IP list, for VPNs, proxies, Tor nodes and hosting providers.
 *
 * It decides by source address as the reputation list does, and every rule is
 * declared-only for the same reason.
 */
export const simWafAnonymousIpList: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesAnonymousIpList",
  labelNamespace: "awswaf:managed:aws:anonymous-ip-list",
  capacity: 50,
  rules: [
    { name: "AnonymousIPList", label: "AnonymousIPList", tier: "declared" },
    {
      name: "HostingProviderIPList",
      label: "HostingProviderIPList",
      tier: "declared",
    },
  ],
};
