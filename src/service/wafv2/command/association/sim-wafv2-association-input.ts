import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type SimWafProtectedResource,
  type SimWafProtectedResourceType,
  simWafProtectedResource,
  simWafProtectedResourceTypes,
} from "../../association/sim-waf-protected-resource.js";
import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../../error/sim-wafv2.error.js";
import { requiredSimWafArn } from "../sim-wafv2-input.js";

/**
 * What ListResourcesForWebACL lists when the request names no resource type.
 *
 * Real WAFv2 documents that default, and it is not one of the types simulated
 * here. A listing that names nothing is refused, because the empty list a load
 * balancer listing produces reads as a web ACL protecting nothing.
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
 * Read the resource type a listing named, refusing one this simulation does
 * not hold.
 */
export function simWafListedResourceType(
  resourceType: string | undefined,
): SimWafProtectedResourceType {
  const listed = resourceType ?? defaultResourceType;
  const simulated = simWafProtectedResourceTypes.find(
    (candidate) => candidate === listed,
  );

  if (simulated === undefined) {
    throw new SimWafUnsimulatedInputException(
      `AWS WAF lists ${listed} resources, and ` +
        `${simWafProtectedResourceTypes.join(" and ")} are the types Yulin ` +
        `simulates. ListResourcesForWebACL lists ${defaultResourceType} when ` +
        `a request names no ResourceType, so name one of the simulated types ` +
        `to list the resources a web ACL protects.`,
    );
  }

  return simulated;
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
