import { SimIamEitherSideAllowRequirement } from "../../../iam/authorize/allow/sim-iam-allow-requirement.js";
import { SimIamPolicyDecision } from "../../../iam/authorize/sim-iam-decision.js";
import type { SimIamPolicyDocument } from "../../../iam/policy/sim-iam-policy.js";
import {
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";

/**
 * The IAM action a request to a method is authorized against.
 *
 * It is the only `execute-api` action evaluated here. The others AWS defines
 * are WebSocket management and REST API cache invalidation, and nothing
 * constrains the action string a policy may name, so a policy is free to grant
 * one of them and nothing will ask about it.
 */
export const simExecuteApiInvokeAction = "execute-api:Invoke";

/**
 * The IAM policy document a Lambda authorizer answers with, evaluated for
 * `execute-api:Invoke` on the method ARN the request was authorized under.
 *
 * The document the authorizer returned is the whole decision. There are no
 * stored policies to gather, because there is no IAM principal here at all.
 * The `principalId` returned alongside is a name the authorizer chose for the
 * caller, so it identifies the caller in the authorizer's own logs and grants
 * nothing.
 *
 * An explicit Deny wins over an Allow, and a document allowing nothing
 * relevant refuses the request. Real API Gateway answers the two with
 * different bodies, so they are told apart here.
 */
export class SimRestApiAuthorizerPolicy {
  private readonly document: SimIamPolicyDocument;

  constructor(document: SimIamPolicyDocument) {
    this.document = document;
  }

  /**
   * What this document says about a request to one method, answering
   * `undefined` where it allows the request through.
   *
   * Throws the way IAM does for a document it cannot read, which the caller
   * answers with the same 500 any other unusable authorizer response gets.
   */
  refusal(methodArn: string): SimRestApiAuthorization | undefined {
    const decision = new SimIamPolicyDecision({
      // The document is evaluated as the identity side, which is the side with
      // no Principal to state. An authorizer's policy says what the caller it
      // just identified may do rather than who may reach the method.
      identityPolicies: [
        {
          sourceType: "identity-inline",
          document: this.document,
          policyName: "AuthorizerPolicyDocument",
        },
      ],
      resourcePolicies: [],
      // An authorizer's policy document is evaluated on its own. No Account
      // boundary is being crossed here, so no service control policy applies.
      serviceControlPolicies: [],
      allowRequirement: new SimIamEitherSideAllowRequirement(),
      action: simExecuteApiInvokeAction,
      resource: methodArn,
      conditionContext: {},
      // There is no principal behind this document, and nothing in it can name
      // one, so the caller is anonymous. A condition on a principal key
      // therefore never matches, which is the strict direction to be wrong in.
      caller: {
        principal: { kind: "anonymous" },
        identityPolicyPrincipal: { kind: "anonymous" },
      },
    });

    if (decision.isExplicitDeny) {
      return SimRestApiRefused.explicitDeny();
    }

    return decision.isAllowed ? undefined : SimRestApiRefused.implicitDeny();
  }
}
