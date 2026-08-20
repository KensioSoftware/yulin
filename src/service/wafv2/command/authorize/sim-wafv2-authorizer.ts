import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * The three listings have no resource type on real WAFv2, so IAM evaluates
 * them against `*` and only a policy whose Resource is `*` allows them. A
 * policy naming web ACL ARNs allows no listing, however broadly those ARNs are
 * written.
 */
const noResource = "*";

interface SimWafAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to WAFv2 requests.
 *
 * An operation on one resource authorizes against that resource's ARN, which
 * is the form WAFv2 policies are written in. The id is generated, so a policy
 * that names a resource ends in a wildcard where the id goes:
 * `arn:aws:wafv2:us-east-1:111111111111:regional/webacl/api-acl/*`.
 */
export class SimWafAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;

  constructor(properties: SimWafAuthorizerProperties) {
    this.#iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on one WAFv2 resource.
   *
   * The resource need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the resource is there, and a create authorizes against the ARN the
   * resource is about to have.
   */
  authorizeResource(
    action: string,
    resource: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    const decision = this.#iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }

    return decision.caller;
  }

  /**
   * Ensure the caller may perform an action real WAFv2 gives no resource type,
   * which is each of the three listings.
   */
  authorizeNoResource(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, caller);
  }
}
