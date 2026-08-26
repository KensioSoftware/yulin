import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import type { SimHttpApiMatch } from "../../api/sim-http-api-match.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";

/**
 * Everything a route authorization decision is made from.
 *
 * The whole match is carried rather than only the route, because an `AWS_IAM`
 * route is authorized against an ARN naming the stage that served the request
 * and the path it asked for, both of which the match settled.
 */
export interface SimHttpApiRouteAuthorizeInput {
  readonly api: SimHttpApi;
  readonly match: SimHttpApiMatch;
  readonly request: Request;
  /**
   * The AWS-shaped hostname the request arrived on, which is the endpoint API
   * Gateway generated or a custom domain mapped to the API. A `REQUEST`
   * authorizer's event names it, the way an integration's event does.
   */
  readonly domainName: string;
  /**
   * The principal the serving boundary attributed the request to, from a
   * signature or from a named caller, and anonymous when it carried neither.
   */
  readonly caller: SimAwsRequestCaller;
  /**
   * IAM of the Account that owns the API, which is what decides an `AWS_IAM`
   * route. It is the API's own rather than the caller's, and rather than the
   * integrated function's.
   */
  readonly iam: SimIamInterServiceAuthZ;
}
