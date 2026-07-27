import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimKmsKey } from "../../key/sim-kms-key.js";

interface SimKmsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to KMS requests.
 *
 * KMS splits into two kinds of request, and they authorize differently:
 *
 * - operations on an existing key, where the key policy is mandatory and must
 *   allow the request, so an identity policy alone never reaches the key;
 * - operations with no key to speak of, such as CreateKey and ListKeys, which
 *   real KMS gives no resource-level permissions and so are authorized against
 *   `*` with identity policies alone.
 */
export class SimKmsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimKmsAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a key.
   *
   * The key's policy is supplied as the resource side and is required to
   * allow: this is the rule that makes a KMS key policy the root of trust for
   * its key rather than one more input to the decision.
   */
  authorizeKey(action: string, key: SimKmsKey, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action,
      resource: key.arn,
      caller,
      resourcePolicies: [key.policy.asResourcePolicy()],
      requiresResourcePolicyAllow: true,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource: key.arn,
      });
    }
  }

  /**
   * Ensure the caller may perform an action that names no particular key.
   */
  authorizeAccount(action: string, caller?: SimAwsCaller): void {
    const resource = `arn:aws:kms:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:key/*`;

    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }
  }
}
