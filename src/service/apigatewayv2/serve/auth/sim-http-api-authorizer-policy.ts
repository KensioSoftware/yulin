import { SimIamEitherSideAllowRequirement } from "../../../iam/authorize/allow/sim-iam-allow-requirement.js";
import { SimIamPolicyDecision } from "../../../iam/authorize/sim-iam-decision.js";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import { simExecuteApiInvokeAction } from "./sim-http-api-iam-route-authorizer.js";

/**
 * The IAM policy document a Lambda authorizer answers with, evaluated for
 * `execute-api:Invoke` on the route the request matched.
 *
 * This is the same evaluation an `AWS_IAM` route goes through, with one
 * difference: the document the authorizer returned is the whole decision.
 * There are no stored policies to gather, because there is no IAM principal
 * here at all. The `principalId` the authorizer returns alongside is a name it
 * chose for the caller rather than anything IAM knows, so it identifies the
 * caller in the authorizer's own logs and grants nothing.
 *
 * An explicit Deny still wins over an Allow, and a document allowing nothing
 * relevant refuses the request, which is how IAM reads any policy.
 */
export class SimHttpApiAuthorizerPolicy {
  private readonly document: SimIamPolicyDocument;

  constructor(document: SimIamPolicyDocument) {
    this.document = document;
  }

  /**
   * Whether this document allows the request to reach the route.
   *
   * Throws the way IAM does for a document it cannot read, which the caller
   * answers with the same 500 any other unusable authorizer response gets.
   */
  allows(routeArn: string): boolean {
    return new SimIamPolicyDecision({
      // The document is evaluated as the identity side, which is the side with
      // no Principal to state: an authorizer's policy says what the caller it
      // just identified may do, not who may reach the route.
      identityPolicies: [
        {
          sourceType: "identity-inline",
          document: this.document,
          policyName: "AuthorizerPolicyDocument",
        },
      ],
      resourcePolicies: [],
      allowRequirement: new SimIamEitherSideAllowRequirement(),
      action: simExecuteApiInvokeAction,
      resource: routeArn,
      conditionContext: {},
      // There is no principal behind this document, and nothing in it can name
      // one, so the caller is anonymous. A condition on a principal key
      // therefore never matches, which is the strict direction to be wrong in.
      caller: {
        principal: { kind: "anonymous" },
        identityPolicyPrincipal: { kind: "anonymous" },
      },
    }).isAllowed;
  }
}
