import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface SimGlueAuthorizeProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly action: string;
  readonly resources: readonly string[];
  readonly caller: SimAwsCaller | undefined;
}

/**
 * Authorize every resource an operation reaches, outermost first.
 *
 * The first refusal names the resource the policy left out, so a policy
 * carrying the table and missing the catalog says the catalog.
 */
export function authorizeSimGlueResources(
  properties: SimGlueAuthorizeProperties,
): SimAwsResolvedCaller {
  const { iam, action, caller } = properties;
  let resolved: SimAwsResolvedCaller | undefined;

  for (const resource of properties.resources) {
    const decision = iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }

    resolved = decision.caller;
  }

  assertDefined(resolved, `the caller a Glue ${action} authorized`);

  return resolved;
}
