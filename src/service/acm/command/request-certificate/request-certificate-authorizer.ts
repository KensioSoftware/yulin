import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import type { SimIamConditions } from "../../../iam/tag/sim-iam-tag-conditions.js";
import {
  type SimIamCreateTag,
  simIamTagOnCreate,
} from "../../../iam/tag/sim-iam-tag-on-create.js";

interface RequestCertificateAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly resource: string;
}

/**
 * Applies IAM authorization to an ACM RequestCertificate request.
 *
 * ACM authorizes this operation against the wildcard certificate resource for
 * the current Account and Region because the certificate does not exist until
 * the request succeeds.
 *
 * A request carrying tags needs `acm:AddTagsToCertificate` as well, which is
 * authorized against the same resource. Both actions see the tags as
 * `aws:RequestTag/<key>` and `aws:TagKeys`.
 */
export class RequestCertificateAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly resource: string;

  constructor(properties: RequestCertificateAuthorizerProperties) {
    this.iam = properties.iam;
    this.resource = properties.resource;
  }

  /**
   * Ensure the caller may request a certificate in this Account and Region,
   * with the tags given.
   *
   * The caller is passed through unchanged so IAM can distinguish an omitted
   * caller, which defaults to Account root, from an explicit anonymous caller.
   */
  authorize(
    tags: readonly SimIamCreateTag[] | undefined,
    caller?: SimAwsCaller,
  ): void {
    const request = simIamTagOnCreate(
      "acm:RequestCertificate",
      "acm:AddTagsToCertificate",
      tags,
    );

    for (const action of request.actions) {
      this.authorizeAction(action, request.conditions, caller);
    }
  }

  private authorizeAction(
    action: string,
    conditionContext: SimIamConditions,
    caller: SimAwsCaller | undefined,
  ): void {
    const decision = this.iam.authorize({
      action,
      resource: this.resource,
      caller,
      conditionContext,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource: this.resource,
      });
    }
  }
}
