import type { SimHttpApiAuthorization } from "../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiIntegrationOutcome } from "./sim-http-api-integration-outcome.js";
import type { SimHttpApiServing } from "./sim-http-api-serving.js";

/**
 * What one request through the endpoint produced, gathered as it happened so
 * that the stage's access log can describe it afterwards.
 *
 * A request the stage's throttle refused has neither an authorization nor an
 * integration, and one an authorizer refused has an authorization alone.
 */
export interface SimHttpApiServed {
  readonly response: Response;
  readonly authorization?: SimHttpApiAuthorization | undefined;
  readonly integration?: SimHttpApiIntegrationOutcome | undefined;
}

/**
 * A serving the controller has stamped with the id this request is logged and
 * reported under, which every path below it then names.
 */
export interface SimHttpApiServedRequest extends SimHttpApiServing {
  readonly requestId: string;
}
