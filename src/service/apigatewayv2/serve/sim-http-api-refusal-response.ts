import type { SimHttpApiRefused } from "../api/authorizer/sim-http-api-authorization.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";

/**
 * The response a request the route's authorization refused gets back.
 *
 * A 403 is an unmet route scope, where the token was accepted and does not
 * allow this route, an `AWS_IAM` route IAM did not allow the caller, or a
 * Lambda authorizer that said no. A 500 is that authorizer failing, which is
 * the API's problem rather than the caller's, and is the same answer a failed
 * integration gets. Everything else is one 401.
 */
export class SimHttpApiRefusalResponse {
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();

  /**
   * Build the response for one refusal.
   */
  build(refused: SimHttpApiRefused): Response {
    switch (refused.kind) {
      case "forbidden": {
        return this.errorResponse.forbidden();
      }
      case "error": {
        return this.errorResponse.internalServerError();
      }
      case "unauthorized": {
        return this.errorResponse.unauthorized(refused.errorDescription);
      }
    }
  }
}
