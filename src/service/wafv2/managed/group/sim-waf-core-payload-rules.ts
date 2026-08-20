import {
  simWafInBody,
  simWafInCookies,
  simWafInQueryArguments,
  simWafInUriPath,
} from "../detect/sim-waf-managed-components.js";
import {
  simWafDetectsEc2MetadataSsrf,
  simWafDetectsGenericLfi,
  simWafDetectsGenericRfi,
  simWafDetectsRestrictedExtension,
} from "../detect/sim-waf-managed-patterns.js";
import type { SimWafManagedRuleDefinition } from "../sim-waf-managed-rule.type.js";

/**
 * The core rule set rules that look inside a request, in AWS's order.
 *
 * These are the last sixteen rules of the group. Each of them reads one
 * component for one payload, which is what the end of a rule name says, and
 * the four `CrossSiteScripting_*` rules that close the group detect nothing:
 * AWS documents none of the detection they run.
 */
export const simWafCorePayloadRules: readonly SimWafManagedRuleDefinition[] = [
  {
    name: "EC2MetaDataSSRF_BODY",
    label: "EC2MetaDataSSRF_Body",
    tier: "documented",
    detects: simWafInBody(simWafDetectsEc2MetadataSsrf),
  },
  {
    name: "EC2MetaDataSSRF_COOKIE",
    label: "EC2MetaDataSSRF_Cookie",
    tier: "documented",
    detects: simWafInCookies(simWafDetectsEc2MetadataSsrf),
  },
  {
    name: "EC2MetaDataSSRF_URIPATH",
    label: "EC2MetaDataSSRF_URIPath",
    tier: "documented",
    detects: simWafInUriPath(simWafDetectsEc2MetadataSsrf),
  },
  {
    name: "EC2MetaDataSSRF_QUERYARGUMENTS",
    label: "EC2MetaDataSSRF_QueryArguments",
    tier: "documented",
    detects: simWafInQueryArguments(simWafDetectsEc2MetadataSsrf),
  },
  {
    name: "GenericLFI_QUERYARGUMENTS",
    label: "GenericLFI_QueryArguments",
    tier: "documented",
    detects: simWafInQueryArguments(simWafDetectsGenericLfi),
  },
  {
    name: "RestrictedExtensions_URIPATH",
    label: "RestrictedExtensions_URIPath",
    tier: "documented",
    detects: simWafInUriPath(simWafDetectsRestrictedExtension),
  },
  {
    name: "RestrictedExtensions_QUERYARGUMENTS",
    label: "RestrictedExtensions_QueryArguments",
    tier: "documented",
    detects: simWafInQueryArguments(simWafDetectsRestrictedExtension),
  },
  {
    name: "GenericLFI_URIPATH",
    label: "GenericLFI_URIPath",
    tier: "documented",
    detects: simWafInUriPath(simWafDetectsGenericLfi),
  },
  {
    name: "GenericLFI_BODY",
    label: "GenericLFI_Body",
    tier: "documented",
    detects: simWafInBody(simWafDetectsGenericLfi),
  },
  {
    name: "GenericRFI_QUERYARGUMENTS",
    label: "GenericRFI_QueryArguments",
    tier: "documented",
    detects: simWafInQueryArguments(simWafDetectsGenericRfi),
  },
  {
    name: "GenericRFI_BODY",
    label: "GenericRFI_Body",
    tier: "documented",
    detects: simWafInBody(simWafDetectsGenericRfi),
  },
  {
    name: "GenericRFI_URIPATH",
    label: "GenericRFI_URIPath",
    tier: "documented",
    detects: simWafInUriPath(simWafDetectsGenericRfi),
  },
  {
    name: "CrossSiteScripting_COOKIE",
    label: "CrossSiteScripting_Cookie",
    tier: "declared",
  },
  {
    name: "CrossSiteScripting_QUERYARGUMENTS",
    label: "CrossSiteScripting_QueryArguments",
    tier: "declared",
  },
  {
    name: "CrossSiteScripting_BODY",
    label: "CrossSiteScripting_Body",
    tier: "declared",
  },
  {
    name: "CrossSiteScripting_URIPATH",
    label: "CrossSiteScripting_URIPath",
    tier: "declared",
  },
];
