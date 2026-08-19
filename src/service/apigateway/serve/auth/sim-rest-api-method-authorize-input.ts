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
}
