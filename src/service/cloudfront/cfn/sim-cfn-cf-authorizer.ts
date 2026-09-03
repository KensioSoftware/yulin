import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { simCfAuthorize } from "../sim-cf-authorize.js";

interface SimCfnCfAuthorizerProperties {
  readonly accountId: SimAwsAccountId;
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Authorizes the CloudFront Resources a template is the only way to make.
 *
 * A cache policy, an origin request policy, a response headers policy and an
 * origin access control have no SDK command here, so their CloudFormation
 * creators reach the stored policy directly rather than through a command that
 * would ask IAM on the way. This is where those creators ask instead, so a
 * deploy Role holding no CloudFront permission is refused the way real
 * CloudFormation refuses it.
 */
export class SimCfnCfAuthorizer {
  private readonly accountId: SimAwsAccountId;
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimCfnCfAuthorizerProperties) {
    this.accountId = properties.accountId;
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may take an action that names nothing yet.
   *
   * A create action has no ID to authorize against until it succeeds, and
   * CloudFront offers no resource-level permission for one, so a policy
   * granting it writes `*` and that is what it is decided against.
   */
  authorizeAny(action: string, options?: SimCfnResourceCallerOptions): void {
    simCfAuthorize({
      iam: this.iam,
      action,
      resource: "*",
      caller: options?.caller,
    });
  }

  /**
   * Ensure the caller may take an action on the CloudFront resource a path
   * names, such as `cache-policy/8f1a2b3c`.
   *
   * A delete names the thing it is deleting, so a policy can grant deleting
   * one cache policy without granting deleting every cache policy in the
   * Account.
   */
  authorizeResource(
    action: string,
    resourcePath: string,
    options?: SimCfnResourceCallerOptions,
  ): void {
    simCfAuthorize({
      iam: this.iam,
      action,
      resource: `arn:aws:cloudfront::${this.accountId}:${resourcePath}`,
      caller: options?.caller,
    });
  }
}
