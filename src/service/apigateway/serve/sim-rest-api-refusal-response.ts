import type { SimRestApiRefused } from "../api/authorizer/sim-rest-api-authorization.js";
import { SimApiGatewayErrorResponse } from "./sim-api-gateway-error-response.js";

/**
 * The response a request the method's authorization refused gets back.
 *
 * Real API Gateway answers a deny with two different bodies, one for a Deny
 * statement that matched and one for a policy allowing nothing relevant, so
 * both are here. An authorizer that could not answer is the API's problem
 * rather than the caller's, and gets the same 500 it does on AWS. A request
 * carrying no token is the one 401.
 */
export class SimRestApiRefusalResponse {
  private readonly errorResponse = new SimApiGatewayErrorResponse();

  /**
   * Build the response for one refusal.
   */
  build(refused: SimRestApiRefused): Response {
    switch (refused.kind) {
      case "unauthorized": {
        return this.errorResponse.unauthorized();
      }
      case "explicit-deny": {
        return this.errorResponse.explicitDeny();
      }
      case "implicit-deny": {
        return this.errorResponse.implicitDeny();
      }
      case "error": {
        return this.errorResponse.internalServerError();
      }
    }
  }
}
