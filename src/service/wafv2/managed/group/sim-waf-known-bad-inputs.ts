import {
  simWafInBody,
  simWafInHeaders,
  simWafInQueryString,
  simWafInUriPath,
} from "../detect/sim-waf-managed-components.js";
import {
  simWafDetectsExploitablePath,
  simWafDetectsJavaDeserializationRce,
  simWafDetectsLog4JRce,
} from "../detect/sim-waf-managed-patterns.js";
import type { SimWafManagedRuleGroupDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The AWS known bad inputs rule set, in the order AWS evaluates its rules.
 *
 * This is the group that goes on beside the core rule set. Every rule blocks
 * by default.
 *
 * `Host_localhost_HEADER` reads the AWS-facing hostname rather than the Host
 * header as it arrived. A simulated endpoint is served under
 * `*.sim-aws.localhost`, so a rule reading the header itself would block every
 * request to every simulated endpoint and nothing else would ever be tested.
 */
export const simWafKnownBadInputsRuleSet: SimWafManagedRuleGroupDefinition = {
  name: "AWSManagedRulesKnownBadInputsRuleSet",
  labelNamespace: "awswaf:managed:aws:known-bad-inputs",
  capacity: 200,
  rules: [
    {
      name: "JavaDeserializationRCE_HEADER",
      label: "JavaDeserializationRCE_Header",
      tier: "documented",
      detects: simWafInHeaders(simWafDetectsJavaDeserializationRce),
    },
    {
      name: "JavaDeserializationRCE_BODY",
      label: "JavaDeserializationRCE_Body",
      tier: "documented",
      detects: simWafInBody(simWafDetectsJavaDeserializationRce),
    },
    {
      name: "JavaDeserializationRCE_URIPATH",
      label: "JavaDeserializationRCE_URIPath",
      tier: "documented",
      detects: simWafInUriPath(simWafDetectsJavaDeserializationRce),
    },
    {
      name: "JavaDeserializationRCE_QUERYSTRING",
      label: "JavaDeserializationRCE_QueryString",
      tier: "documented",
      detects: simWafInQueryString(simWafDetectsJavaDeserializationRce),
    },
    {
      name: "Host_localhost_HEADER",
      label: "Host_Localhost_Header",
      tier: "exact",
      detects: (parts): boolean =>
        parts.host.toLowerCase().includes("localhost"),
    },
    {
      name: "PROPFIND_METHOD",
      label: "Propfind_Method",
      tier: "exact",
      detects: (parts): boolean => parts.method === "PROPFIND",
    },
    {
      name: "ExploitablePaths_URIPATH",
      label: "ExploitablePaths_URIPath",
      tier: "documented",
      detects: simWafInUriPath(simWafDetectsExploitablePath),
    },
    {
      name: "Log4JRCE_HEADER",
      label: "Log4JRCE_Header",
      tier: "documented",
      detects: simWafInHeaders(simWafDetectsLog4JRce),
    },
    {
      name: "Log4JRCE_QUERYSTRING",
      label: "Log4JRCE_QueryString",
      tier: "documented",
      detects: simWafInQueryString(simWafDetectsLog4JRce),
    },
    {
      name: "Log4JRCE_BODY",
      label: "Log4JRCE_Body",
      tier: "documented",
      detects: simWafInBody(simWafDetectsLog4JRce),
    },
    {
      name: "Log4JRCE_URIPATH",
      label: "Log4JRCE_URIPath",
      tier: "documented",
      detects: simWafInUriPath(simWafDetectsLog4JRce),
    },
  ],
};
