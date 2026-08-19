import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAwsRequestCaller } from "../../../iam/request/sim-aws-request-caller.js";
import type { SimRestApiMatch } from "../../api/match/sim-rest-api-match.js";
import type { SimRestApi } from "../../api/sim-rest-api.js";

/**
 * Everything a method authorization decision is made from.
 *
 * The whole match is carried rather than only the method, because the
 * `methodArn` an authorizer is handed names the stage that served the request
 * and the path it asked for, both of which the match settled.
 */
export interface SimRestApiMethodAuthorizeInput {
  readonly restApi: SimRestApi;
  readonly match: SimRestApiMatch;
  readonly request: Request;
  /**
   * The principal the serving boundary attributed the request to, from a
   * signature or from a named caller, and anonymous when it carried neither.
   */
  readonly caller: SimAwsRequestCaller;
  /**
   * IAM of the Account that owns the API, which is what decides an `AWS_IAM`
   * method. It is the API's own rather than the caller's, and rather than the
   * integrated function's.
   */
  readonly iam: SimIamInterServiceAuthZ;
}
