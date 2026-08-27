import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimSecretsManagerSecret } from "../../secret/sim-secrets-manager-secret.js";

/**
 * The resource an operation with no particular secret authorizes against.
 *
 * Real Secrets Manager gives ListSecrets no resource-level permissions, so a
 * policy allowing it has to use a resource of `*`. Authorizing against `*`
 * here is what makes a policy naming individual secret ARNs fail the same way
 * it would on real AWS.
 */
const anyResource = "*";

interface SimSecretsManagerAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies simulated IAM authorization to Secrets Manager requests.
 *
 * Every operation authorizes the IAM action real Secrets Manager names for it,
 * against the secret's full ARN. That ARN carries the six random characters
 * Secrets Manager appends, so a policy written against the bare name reaches
 * nothing, exactly as on real AWS.
 */
export class SimSecretsManagerAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimSecretsManagerAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform an action on one secret.
   */
  authorizeSecret(
    action: string,
    secret: SimSecretsManagerSecret,
    caller?: SimAwsCaller,
  ): void {
    this.authorizeResource(action, secret.arn.value, caller);
  }

  /**
   * Ensure the caller may perform an action that names no particular secret.
   */
  authorizeAny(action: string, caller?: SimAwsCaller): void {
    this.authorizeResource(action, anyResource, caller);
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): void {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }
  }
}
