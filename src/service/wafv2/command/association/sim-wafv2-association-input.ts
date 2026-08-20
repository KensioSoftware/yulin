import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import {
  type SimWafProtectedResource,
  simWafApiGatewayResourceType,
  simWafProtectedResource,
} from "../../association/sim-waf-protected-resource.js";
import {
  SimWafInvalidParameterException,
  SimWafUnsimulatedInputException,
} from "../../error/sim-wafv2.error.js";
import { requiredSimWafArn } from "../sim-wafv2-input.js";

/**
 * What ListResourcesForWebACL lists when the request names no resource type.
 *
 * Real WAFv2 documents that default, and it is not the type simulated here. A
 * listing that names nothing is refused, because the empty list a load
 * balancer listing produces reads as a web ACL protecting nothing.
 */
const defaultResourceType = "APPLICATION_LOAD_BALANCER";

/**
 * Read the resource an association named, and hold it to one Region.
 *
 * A web ACL protects what is in its own Account and Region, as it does on AWS.
 * The Account falls out of the lookup afterwards, since a REST API stage ARN
 * carries none, and the Region has to be read out of the ARN here.
 */
export function simWafAssociationResource(
  resourceArn: string | undefined,
  accountRegionScope: SimAwsAccountRegionScope,
): SimWafProtectedResource {
  const resource = simWafProtectedResource(
    requiredSimWafArn(resourceArn, "ResourceArn"),
  );
  const { regionName } = accountRegionScope;

  if (resource.regionName !== regionName) {
    throw new SimWafInvalidParameterException(
      `Error reason: The resource ${resource.arn} is in ` +
        `${resource.regionName}, and this request was made in ` +
        `${regionName}., field: RESOURCE_ARN, parameter: ${resource.arn}`,
    );
  }

  return resource;
}

/**
 * Refuse a listing for a resource type this simulation does not hold.
 */
export function refuseUnsimulatedSimWafResourceType(
  resourceType: string | undefined,
): void {
  const listed = resourceType ?? defaultResourceType;

  if (listed !== simWafApiGatewayResourceType) {
    throw new SimWafUnsimulatedInputException(
      `AWS WAF lists ${listed} resources, and ` +
        `${simWafApiGatewayResourceType} is the type Yulin simulates. ` +
        `ListResourcesForWebACL lists ${defaultResourceType} when a request ` +
        `names no ResourceType, so name ${simWafApiGatewayResourceType} to ` +
        `list the REST API stages a web ACL protects.`,
    );
  }
}
