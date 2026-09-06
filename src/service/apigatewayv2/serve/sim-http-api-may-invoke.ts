import { SimHttpApiExecuteApiArn } from "../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimHttpApiInvokeAuthorizer } from "./auth/sim-http-api-invoke-authorizer.js";
import type { SimHttpApiFunctionTarget } from "./sim-http-api-function-target.js";

interface SimHttpApiMayInvokeInput {
  readonly api: SimHttpApi;
  readonly match: SimHttpApiMatch;
  readonly request: Request;
}

/**
 * Whether the API lacks permission to invoke a function behind one of its
 * routes.
 *
 * The route the request matched is supplied as the source ARN, so a permission
 * granted for one route does not open another. This is the API's own question
 * rather than the client's, whose was already answered by the route's
 * authorization.
 */
export function simHttpApiMayNotInvoke(
  input: SimHttpApiMayInvokeInput,
  target: SimHttpApiFunctionTarget,
): boolean {
  const { api, match, request } = input;

  return new SimHttpApiInvokeAuthorizer({ iam: target.iam }).authorize({
    api,
    target,
    sourceArn: SimHttpApiExecuteApiArn.forMatchedRoute(
      api,
      match,
      request.method,
    ),
  }).isDenied;
}
