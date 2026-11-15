import type { SimIamResourcePolicyInput } from "../../../iam/authorize/context/sim-iam-auth-z-input.js";
import { simAwsSourceIpCondition } from "../../../iam/request/sim-aws-source-ip-condition.js";
import type { SimIamConditionValue } from "../../../iam/policy/sim-iam-policy.js";
import {
  type SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { SimRestApiExecuteApiArn } from "../../api/sim-rest-api-execute-api-arn.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";
import { simExecuteApiInvokeAction } from "./sim-rest-api-authorizer-policy.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";

/**
 * What an API's resource policy says about one request on its own.
 */
export type SimRestApiPolicyVerdict = "allow" | "explicit-deny" | "neither";

/**
 * The resource policy an API holds, as sim IAM takes one.
 */
export function simRestApiResourcePolicies(
  restApi: SimRestApi,
): readonly SimIamResourcePolicyInput[] {
  return restApi.policy === undefined
    ? []
    : [
        {
          document: restApi.policy.document,
          sourceType: "resource",
          resourceArn: restApi.arn,
        },
      ];
}

/**
 * The request values a REST API's policies are matched against.
 */
export function simRestApiConditionContext(
  input: SimRestApiMethodAuthorizeInput,
): Readonly<Record<string, SimIamConditionValue>> {
  return simAwsSourceIpCondition(input.sourceIp);
}

/**
 * The `execute-api` ARN a request is authorized against.
 */
export function simRestApiRequestArn(
  input: SimRestApiMethodAuthorizeInput,
): string {
  return SimRestApiExecuteApiArn.forRequest(
    input.restApi,
    input.match,
    input.request.method,
  ).toString();
}

/**
 * Evaluates an API's resource policy for a method IAM does not authenticate.
 *
 * Such a method has no IAM principal behind it, so the policy is evaluated
 * for an anonymous caller. A statement granting `"Principal": "*"` admits it,
 * and one naming a Role or an Account does not. API Gateway documents the
 * same: a policy naming an AWS principal needs `AWS_IAM` methods.
 */
export class SimRestApiResourcePolicyGate {
  /**
   * What the API's resource policy says about one request, or nothing when the
   * API has no policy.
   */
  verdict(
    input: SimRestApiMethodAuthorizeInput,
  ): SimRestApiPolicyVerdict | undefined {
    const resourcePolicies = simRestApiResourcePolicies(input.restApi);

    if (resourcePolicies.length === 0) {
      return undefined;
    }

    const decision = input.iam.authorize({
      action: simExecuteApiInvokeAction,
      resource: simRestApiRequestArn(input),
      caller: { kind: "anonymous" },
      resourcePolicies,
      conditionContext: simRestApiConditionContext(input),
    });

    if (decision.isAllowed) {
      return "allow";
    }

    return decision.isExplicitDeny === true ? "explicit-deny" : "neither";
  }

  /**
   * Admit a request the method itself admitted, unless the API's resource
   * policy refuses it.
   *
   * Where the policy has to allow the request itself, as it has for a `NONE`
   * or a `COGNITO_USER_POOLS` method, a policy saying nothing about it refuses
   * it. Where only a Deny refuses it, a policy saying nothing lets it through.
   */
  admit(
    input: SimRestApiMethodAuthorizeInput,
    admitted: SimRestApiAdmitted,
    allowRequired: boolean,
  ): SimRestApiAuthorization {
    const verdict = this.verdict(input);

    if (
      verdict === undefined ||
      verdict === "allow" ||
      (verdict === "neither" && !allowRequired)
    ) {
      return admitted;
    }

    return this.refusal(input, verdict);
  }

  /**
   * The refusal for a verdict that refuses the request.
   */
  refusal(
    input: SimRestApiMethodAuthorizeInput,
    verdict: Exclude<SimRestApiPolicyVerdict, "allow">,
  ): SimRestApiRefused {
    return SimRestApiRefused.byPolicy(verdict === "explicit-deny", {
      principal: "anonymous",
      resource: simRestApiRequestArn(input),
    });
  }
}
