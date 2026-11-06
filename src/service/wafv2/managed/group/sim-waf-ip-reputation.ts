import type { SimWafManagedRuleGroupDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The Amazon IP reputation list, which decides by the address a request came
 * from.
 *
 * AWS publishes none of the addresses on its lists, so every rule here is
 * declared-only. A test says which addresses a rule flags with
 * `managedRules().onAddress`, and sends a request from one of them with the
 * `x-sim-aws-source-ip` header. The group then labels and acts on it as AWS
 * documents. `managedRules().onRequest` declares a match by path instead.
 */
export const simWafIpReputationList: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesAmazonIpReputationList",
  labelNamespace: "awswaf:managed:aws:amazon-ip-list",
  capacity: 25,
  readsSourceAddress: true,
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
 * declared-only for the same reason. `AnonymousIPList` stands for the VPNs,
 * proxies and Tor nodes, and `HostingProviderIPList` for the hosting and cloud
 * providers other than AWS.
 */
export const simWafAnonymousIpList: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesAnonymousIpList",
  labelNamespace: "awswaf:managed:aws:anonymous-ip-list",
  capacity: 50,
  readsSourceAddress: true,
  rules: [
    { name: "AnonymousIPList", label: "AnonymousIPList", tier: "declared" },
    {
      name: "HostingProviderIPList",
      label: "HostingProviderIPList",
      tier: "declared",
    },
  ],
};
