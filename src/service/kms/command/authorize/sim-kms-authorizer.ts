import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimKmsCallerAccountCondition } from "../../key/sim-kms-caller-account.js";
import type { SimKmsKey } from "../../key/sim-kms-key.js";
import { SimKmsViaService } from "../../key/sim-kms-via-service.js";
import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";

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
 *
 * Both carry the KMS condition values a key policy can be written against:
 * `kms:CallerAccount` for the Account the request came from, and
 * `kms:ViaService` where another service made the request on the caller's
 * behalf. A service passing on the caller's own KMS permissions says so, and
 * a key policy admitting whoever the request came from is then not enough by
 * itself.
 */
export class SimKmsAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly callerAccount = new SimKmsCallerAccountCondition();

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
  authorizeKey(
    action: string,
    key: SimKmsKey,
    options: SimKmsRequestOptions = {},
  ): void {
    const decision = this.iam.authorize({
      action,
      resource: key.arn,
      caller: options.caller,
      conditionContext: this.conditionContext(options),
      callerConditions: this.callerAccount,
      resourcePolicies: [key.policy.asResourcePolicy()],
      requiresResourcePolicyAllow: true,
      withCallerPermissions: options.withCallerPermissions,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource: key.arn,
      });
    }
  }

  /**
   * Ensure the caller may perform an action that names no particular key.
   */
  authorizeAccount(action: string, options: SimKmsRequestOptions = {}): void {
    const resource = `arn:aws:kms:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:key/*`;

    const decision = this.iam.authorize({
      action,
      resource,
      caller: options.caller,
      conditionContext: this.conditionContext(options),
      callerConditions: this.callerAccount,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }
  }

  /**
   * The condition values this request carries.
   *
   * A request the caller made itself supplies no `kms:ViaService`, so a policy
   * conditioned on it fails to match rather than matching anything.
   */
  private conditionContext(
    options: SimKmsRequestOptions,
  ): Readonly<Record<string, string>> {
    if (options.viaService === undefined) {
      return {};
    }

    return new SimKmsViaService(
      options.viaService,
      this.accountRegionScope.regionName,
    ).asConditionContext();
  }
}
