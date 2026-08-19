import {
  SimRestApiAdmitted,
  type SimRestApiAuthorization,
  SimRestApiRefused,
} from "../../api/authorizer/sim-rest-api-authorization.js";
import { SimRestApiExecuteApiArn } from "../../api/sim-rest-api-execute-api-arn.js";
import { simExecuteApiInvokeAction } from "./sim-rest-api-authorizer-policy.js";
import type { SimRestApiMethodAuthorizeInput } from "./sim-rest-api-method-authorize-input.js";

/**
 * Decides whether a caller may have an `AWS_IAM` method.
 *
 * This is the client's own authorization, evaluated against the identity
 * policies of the caller the serving boundary resolved. Resource policies on
 * the API are a second mechanism a REST API has and this does not read, so the
 * caller's identity policies are the whole decision, and a caller from another
 * Account is refused: a cross-Account request needs an Allow from each side.
 * The way through, here as on AWS, is to assume a Role in the API's Account.
 *
 * A request carrying no credentials is anonymous rather than unauthenticated,
 * so it comes here like any other and is refused because nothing allows an
 * anonymous caller anything.
 */
export class SimRestApiIamMethodAuthorizer {
  /**
   * Evaluate `execute-api:Invoke` for the caller against the method being
   * called.
   */
  authorize(input: SimRestApiMethodAuthorizeInput): SimRestApiAuthorization {
    const { restApi, match, request, caller, iam } = input;
    const decision = iam.authorize({
      action: simExecuteApiInvokeAction,
      // The ARN of the request the client made, which names the concrete path
      // rather than the resource template, because an identity policy is
      // written by hand against the request being made.
      resource: SimRestApiExecuteApiArn.forRequest(
        restApi,
        match,
        request.method,
      ).toString(),
      caller: caller.toCaller(),
    });

    if (decision.isDenied) {
      // Whether a Deny statement matched or nothing allowed the method is not
      // told apart, because a service-facing decision does not carry it. Both
      // are the 403 real API Gateway answers, with the body it gives a caller
      // its policies left short.
      return SimRestApiRefused.implicitDeny();
    }

    return new SimRestApiAdmitted({ caller });
  }
}
