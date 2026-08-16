import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simSesIdentityArn } from "../../identity/sim-ses-arn.js";

/**
 * The resource an action with no resource type authorizes against.
 *
 * Real SES gives `ses:ListEmailIdentities`, `ses:GetAccount` and
 * `ses:PutAccountDetails` no resource type at all, so IAM evaluates them
 * against `*` and only a policy whose Resource is `*` allows them. A policy
 * naming an identity ARN allows none of them, not even one written against
 * every identity in the Account and Region, here as on AWS.
 */
const noResource = "*";

interface SimSesAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to SES requests.
 *
 * An SES operation on one identity authorizes against that identity's ARN,
 * which is the form SES policies are written in: allowing `ses:SendEmail` on
 * `arn:aws:ses:us-east-1:111111111111:identity/example.com` lets a caller send
 * from any address at that domain, and lets it send from nothing else.
 *
 * A send authorizes against the identity being sent *from*. Recipients never
 * enter into it, which is worth knowing when a policy looks like it should
 * cover a send and does not.
 */
export class SimSesAuthorizer {
  readonly #iam: SimIamInterServiceAuthZ;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSesAuthorizerProperties) {
    this.#iam = properties.iam;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on one email identity.
   *
   * The identity need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the identity is there, and CreateEmailIdentity authorizes against the
   * ARN the identity is about to have.
   */
  authorizeIdentity(
    action: string,
    emailIdentity: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      simSesIdentityArn(this.#accountRegionScope, emailIdentity),
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action real SES gives no resource type,
   * such as listing identities or reading the account.
   *
   * The resource is `*`, which is the only thing such an action can be granted
   * on. Writing the listing's resource as every identity in the Account and
   * Region would be the intuitive reading and the wrong one: a policy scoped
   * that way allows no listing on AWS, and should allow none here.
   */
  authorizeNoResource(
    action: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, noResource, caller);
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
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
}
