import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  isSimRestApiMatch,
  type SimRestApiMiss,
} from "../api/match/sim-rest-api-match.js";
import { SimRestApiRequest } from "../api/match/sim-rest-api-request.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { SimApiGatewayErrorResponse } from "./sim-api-gateway-error-response.js";
import { SimApiGatewayRouter } from "./sim-api-gateway-router.js";
import { SimRestApiIntegrationInvocation } from "./sim-rest-api-integration-invocation.js";

interface SimApiGatewayServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimApiGatewayRouter;
}

/**
 * Localhost HTTP controller for simulated API Gateway REST APIs.
 *
 * A request reaching the generated endpoint is matched to a stage, then walked
 * down the resource tree to a method, and that method's integration invokes a
 * simulated Lambda function with a payload format 1.0 event. The function runs
 * as its execution Role, as it does for any other invocation.
 *
 * Authorizing a method is a separate piece of work. Every method served here
 * is open, and a method declaring an authorizer is refused when it is created
 * rather than served without one.
 */
export class SimApiGatewayServiceController implements SimAwsServiceController {
  private readonly router: SimApiGatewayRouter;
  private readonly integration: SimRestApiIntegrationInvocation;
  private readonly errorResponse = new SimApiGatewayErrorResponse();

  constructor(properties: SimApiGatewayServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimApiGatewayRouter({ simAws });
    // The clock is taken from the router rather than from properties, so a
    // supplied router and the event timestamps belong to the same simulation.
    this.integration = new SimRestApiIntegrationInvocation({
      router: this.router,
      clock: this.router.simAws,
    });
  }

  /**
   * Handle an HTTP request routed to a simulated REST API.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const restApi = this.router.route(serviceRequest.target);

    if (restApi === undefined) {
      return this.errorResponse.forbidden();
    }

    if (restApi.disableExecuteApiEndpoint) {
      // The API exists and has switched its generated endpoint off, which is
      // how an API reachable only through a custom domain is configured.
      return this.errorResponse.forbidden();
    }

    return await this.invoke(restApi, serviceRequest);
  }

  private async invoke(
    restApi: SimRestApi,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request } = serviceRequest;
    // The whole request path, stage segment and all. The stage takes its own
    // segment off, and the event reports the path as the client sent it.
    const match = restApi.match(
      new SimRestApiRequest({
        method: request.method,
        path: new URL(request.url).pathname,
      }),
    );

    if (!isSimRestApiMatch(match)) {
      return this.missResponse(match);
    }

    return await this.integration.invoke({ restApi, match, request });
  }

  /**
   * What a request that reached nothing is answered with.
   *
   * Real API Gateway tells the two apart. A stage the API does not serve is a
   * plain `Forbidden`, while a request that found the stage and matched no
   * method gets `Missing Authentication Token`, whether or not it carried
   * credentials.
   */
  private missResponse(miss: SimRestApiMiss): Response {
    return miss === "stage"
      ? this.errorResponse.forbidden()
      : this.errorResponse.missingAuthenticationToken();
  }
}
