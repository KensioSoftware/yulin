import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type SimWafProtectedResource,
  type SimWafProtectedResourceType,
  simWafProtectedResource,
  simWafProtectedResourceTypes,
} from "../../association/sim-waf-protected-resource.js";
import { SimWafInvalidParameterException } from "../../error/sim-wafv2.error.js";
import type { SimWafWebAcl } from "../../web-acl/sim-waf-web-acl.js";
import { requiredSimWafArn } from "../sim-wafv2-input.js";

/**
 * What ListResourcesForWebACL lists when the request names no resource type,
 * as real WAFv2 documents it.
 */
const defaultResourceType = "APPLICATION_LOAD_BALANCER";

/**
 * Read the resource an association named, and hold it to one Account and
 * Region.
 *
 * A web ACL protects what is in its own Account and Region, as it does on AWS.
 * A REST API stage ARN carries neither, so the Region is read out of the ARN
 * and the Account falls out of the lookup afterwards. A user pool ARN carries
 * both, and one naming another Account is refused here.
 */
export function simWafAssociationResource(
  resourceArn: string | undefined,
  accountRegionScope: SimAwsAccountRegionScope,
): SimWafProtectedResource {
  const resource = simWafProtectedResource(
    requiredSimWafArn(resourceArn, "ResourceArn"),
  );
  const { accountId, regionName } = accountRegionScope;

  if (resource.regionName !== regionName) {
    throw refusedResourceArn(
      `The resource ${resource.arn} is in ${resource.regionName}, and this ` +
        `request was made in ${regionName}.`,
      resource.arn,
    );
  }

  if (resource.accountId !== undefined && resource.accountId !== accountId) {
    throw refusedResourceArn(
      `The resource ${resource.arn} is in Account ${resource.accountId}, and ` +
        `this request was made in ${accountId}.`,
      resource.arn,
    );
  }

  return resource;
}

/**
 * Read the resource type a listing named, refusing one WAFv2 does not list.
 */
export function simWafListedResourceType(
  resourceType: string | undefined,
): SimWafProtectedResourceType {
  const listed = resourceType ?? defaultResourceType;
  const simulated = simWafProtectedResourceTypes.find(
    (candidate) => candidate === listed,
  );

  if (simulated === undefined) {
    throw new SimWafInvalidParameterException(
      `Error reason: ListResourcesForWebACL lists one of ` +
        `${simWafProtectedResourceTypes.join(", ")}, field: RESOURCE_TYPE, ` +
        `parameter: ${listed}`,
    );
  }

  return simulated;
}

const accountTakeoverGroup = "AWSManagedRulesATPRuleSet";

/**
 * Refuse a web ACL carrying the account takeover group in front of a user
 * pool, as AWS does.
 *
 * AWS refuses the whole association over the one rule group. Yulin holds the
 * group without evaluating it, and this is where the refusal lands.
 */
export function refuseSimWafAccountTakeoverForUserPool(
  resource: SimWafProtectedResource,
  webAcl: SimWafWebAcl,
): void {
  if (resource.resourceType !== "COGNITO_USER_POOL") {
    return;
  }

  const carriesGroup = (webAcl.configuration.rules ?? []).some(
    (rule) =>
      rule.Statement?.ManagedRuleGroupStatement?.Name === accountTakeoverGroup,
  );

  if (carriesGroup) {
    throw refusedResourceArn(
      `A web ACL carrying ${accountTakeoverGroup} cannot protect a Cognito ` +
        `user pool`,
      resource.arn,
    );
  }
}

/**
 * The refusal a bad resource ARN reports, in the form WAFv2 writes.
 */
function refusedResourceArn(
  reason: string,
  resourceArn: string,
): SimWafInvalidParameterException {
  return new SimWafInvalidParameterException(
    `Error reason: ${reason}, field: RESOURCE_ARN, parameter: ${resourceArn}`,
  );
}
