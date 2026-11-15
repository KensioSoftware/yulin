import {
  SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { simExecuteApiInvokeAction } from "./sim-rest-api-authorizer-policy.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";
import {
  simRestApiConditionContext,
  simRestApiRequestArn,
  simRestApiResourcePolicies,
} from "./sim-rest-api-resource-policy-gate.js";

/**
 * Decides whether a caller may have an `AWS_IAM` method.
 *
 * The caller the serving boundary resolved is evaluated against its identity
 * policies and the API's resource policy, which is the ordinary IAM rule. In
 * the API's own Account either one allowing the request admits it. A caller
 * from another Account needs both. Without a resource policy, the way in from
 * another Account is to assume a Role in the API's Account.
 *
 * A request carrying no credentials is anonymous rather than unauthenticated,
 * so it comes here like any other. Nothing allows an anonymous caller anything
 * unless the resource policy grants `"Principal": "*"`.
 */
export class SimRestApiIamMethodAuthorizer {
  /**
   * Evaluate `execute-api:Invoke` for the caller against the method being
   * called.
   */
  authorize(input: SimRestApiMethodAuthorizeInput): SimRestApiAuthorization {
    const { restApi, caller, iam } = input;
    // The ARN of the request the client made, which names the concrete path
    // rather than the resource template, because an identity policy is
    // written by hand against the request being made.
    const resource = simRestApiRequestArn(input);
    const decision = iam.authorize({
      action: simExecuteApiInvokeAction,
      resource,
      caller: caller.toCaller(),
      resourcePolicies: simRestApiResourcePolicies(restApi),
      conditionContext: simRestApiConditionContext(input),
    });

    if (decision.isDenied) {
      return SimRestApiRefused.byPolicy(decision.isExplicitDeny === true, {
        principal: decision.caller.arn ?? "anonymous",
        resource,
      });
    }

    return new SimRestApiAdmitted({ caller });
  }
}
