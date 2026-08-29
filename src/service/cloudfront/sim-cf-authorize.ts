import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../iam/error/sim-iam.error.js";

interface SimCfAuthorizeProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly action: string;
  readonly resource: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Ensure a caller may take a CloudFront action on a resource.
 *
 * Every CloudFront command asks IAM the same question and refuses a denial the
 * same way, so the question is asked here rather than once per command group.
 */
export function simCfAuthorize(properties: SimCfAuthorizeProperties): void {
  const { iam, action, resource, caller } = properties;
  const decision = iam.authorize({ action, resource, caller });

  if (decision.isDenied) {
    throw new SimIamAccessDenied({
      principal: decision.caller.principal,
      reason: decision.denialReason,
      action,
      resource,
    });
  }
}
