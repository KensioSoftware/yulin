import {
  SimHttpApiAdmitted,
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiExecuteApiArn } from "../../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

/**
 * The IAM action a request to an `AWS_IAM` route is authorized against.
 *
 * It is the only `execute-api` action evaluated here. The others AWS defines
 * are WebSocket management and REST API cache invalidation, and nothing
 * constrains the action string a policy may name, so a policy is free to grant
 * one of them and nothing will ask about it.
 */
export const simExecuteApiInvokeAction = "execute-api:Invoke";

/**
 * Decides whether a caller may have an `AWS_IAM` route.
 *
 * This is the client's own authorization, evaluated against the identity
 * policies of the caller the serving boundary resolved. An HTTP API has no
 * resource policy, so no resource policies are supplied, and the caller's
 * identity policies are the whole decision. That is also why a caller from
 * another Account is always refused: a cross-Account request needs an Allow
 * from each side, and there is nowhere on an HTTP API to put the resource side.
 * The way through, here as on AWS, is to assume a Role in the API's Account.
 */
export class SimHttpApiIamRouteAuthorizer {
  /**
   * Evaluate `execute-api:Invoke` for the caller against the route being
   * called.
   */
  authorize(input: SimHttpApiRouteAuthorizeInput): SimHttpApiAuthorization {
    const decision = input.iam.authorize({
      action: simExecuteApiInvokeAction,
      resource: this.routeArn(input).toString(),
      caller: input.caller.toCaller(),
    });

    if (decision.isDenied) {
      return SimHttpApiRefused.forbidden();
    }

    return new SimHttpApiAdmitted({ caller: input.caller });
  }

  /**
   * The `execute-api` ARN of the request being authorized.
   *
   * An identity policy is written by hand against the request a caller is
   * making, so this names the concrete method and the concrete path, unlike
   * the ARN the integration's invoke permission is matched against. The method
   * is upper-cased because AWS puts a verb there and a policy names one, while
   * a Fetch request may carry a method in any case.
   */
  private routeArn(
    input: SimHttpApiRouteAuthorizeInput,
  ): SimHttpApiExecuteApiArn {
    const { api, match, request } = input;

    return new SimHttpApiExecuteApiArn({
      api,
      stageName: match.stage.stageName,
      methodAndPath: `${request.method.toUpperCase()}/${match.pathAfterStage}`,
    });
  }
}
