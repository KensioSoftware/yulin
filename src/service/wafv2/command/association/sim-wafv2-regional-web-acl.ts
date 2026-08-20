import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  SimWafInvalidParameterException,
  SimWafNonexistentItemException,
} from "../../error/sim-wafv2.error.js";
import type { SimWafResourceStore } from "../../resource/sim-waf-resource-store.js";
import { simWafArnParts } from "../../sim-wafv2-arn.js";
import type { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";

interface SimWafRegionalWebAclLookup {
  readonly webAclArn: string;
  readonly webAcls: SimWafResourceStore<SimWafWebAcl>;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Get the `REGIONAL` web ACL an association's ARN names.
 *
 * Three things are checked before the store is asked, and each of them says
 * something the store could not. A string that is not a WAFv2 ARN was never a
 * web ACL. A `CLOUDFRONT` scope web ACL protects a CloudFront distribution,
 * which takes its web ACL from the distribution and not from
 * `AssociateWebACL`. A web ACL in another Account or Region belongs to a WAFv2
 * this one has no reach into, and the caller is told where it is rather than
 * that it does not exist.
 */
export function requireRegionalSimWafWebAcl(
  lookup: SimWafRegionalWebAclLookup,
): SimWafWebAcl {
  const { webAclArn } = lookup;
  const parts = simWafArnParts(webAclArn);
  const { accountId, regionName } = lookup.accountRegionScope;

  if (parts === undefined) {
    throw invalidWebAclArn(
      `The ARN isn't valid. A valid ARN begins with arn: and includes other ` +
        `information separated by colons or slashes.`,
      webAclArn,
    );
  }

  if (parts.scope === "CLOUDFRONT") {
    throw invalidWebAclArn(
      `A CLOUDFRONT scope web ACL protects a CloudFront distribution, which ` +
        `takes its web ACL from the distribution and not from AssociateWebACL.`,
      webAclArn,
    );
  }

  if (parts.regionName !== regionName || parts.accountId !== accountId) {
    throw invalidWebAclArn(
      `The web ACL is in ${parts.accountId} ${parts.regionName}, and this ` +
        `request was made in ${accountId} ${regionName}.`,
      webAclArn,
    );
  }

  const webAcl = lookup.webAcls.findByArn(webAclArn);

  if (webAcl === undefined) {
    throw new SimWafNonexistentItemException(
      `AWS WAF couldn't perform the operation because your resource ` +
        `doesn't exist: web ACL ${webAclArn}.`,
    );
  }

  return webAcl;
}

/**
 * The refusal each of those checks reports, in the form WAFv2 writes.
 */
function invalidWebAclArn(
  reason: string,
  webAclArn: string,
): SimWafInvalidParameterException {
  return new SimWafInvalidParameterException(
    `Error reason: ${reason}, field: WEB_ACL_ARN, parameter: ${webAclArn}`,
  );
}
