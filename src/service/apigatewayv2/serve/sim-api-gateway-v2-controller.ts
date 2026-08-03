import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimHttpApiRequest } from "../api/sim-http-api-request.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimHttpApiRouteAuthorizer } from "./auth/sim-http-api-route-authorizer.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { SimHttpApiIntegrationInvocation } from "./sim-http-api-integration-invocation.js";
import { SimHttpApiRefusalResponse } from "./sim-http-api-refusal-response.js";

interface SimApiGatewayV2ServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimApiGatewayV2Router;
}

/**
 * Localhost HTTP controller for simulated API Gateway HTTP APIs.
 *
 * A request reaching the generated endpoint is matched to a route, and the
 * route's integration invokes a simulated Lambda function with a payload
 * format 2.0 event. The function runs as its execution Role, as it does for
 * any other invocation.
 *
 * A route that authorizes anybody is checked before any of that: a JWT route's
 * token has to verify and meet the route's scopes, an `AWS_IAM` route's caller
 * has to be allowed `execute-api:Invoke` on the route, and a `CUSTOM` route's
 * Lambda authorizer has to allow the request, or the request is refused and the
 * integration is never invoked. Whether the API may invoke a function is a
 * separate question, and the API's own rather than the client's.
 */
export class SimApiGatewayV2ServiceController implements SimAwsServiceController {
  private readonly router: SimApiGatewayV2Router;
  private readonly routeAuthorizer: SimHttpApiRouteAuthorizer;
  private readonly integration: SimHttpApiIntegrationInvocation;
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();
  private readonly refusalResponse = new SimHttpApiRefusalResponse();

  constructor(properties: SimApiGatewayV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimApiGatewayV2Router({ simAws });
    // The clock is taken from the router rather than from properties, so a
    // supplied router, the event timestamps and the token expiry checks all
    // belong to the same simulation.
    this.routeAuthorizer = new SimHttpApiRouteAuthorizer({
      clock: this.router.simAws,
      functions: this.router,
    });
    this.integration = new SimHttpApiIntegrationInvocation({
      router: this.router,
      clock: this.router.simAws,
    });
  }

  /**
   * Handle an HTTP request routed to a simulated HTTP API.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const httpApi = this.router.route(serviceRequest.target);

    if (httpApi === undefined) {
      return this.errorResponse.notFound();
    }

    if (httpApi.disableExecuteApiEndpoint) {
      // The API exists but has switched its generated endpoint off, which is
      // how an API reachable only through a custom domain is configured.
      return this.errorResponse.forbidden();
    }

    return await this.invoke(httpApi, serviceRequest);
  }

  private async invoke(
    api: SimHttpApi,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request } = serviceRequest;
    // The whole request path, stage segment and all: the stage takes its own
    // segment off, and `rawPath` reports the path as the client sent it.
    const match = api.match(
      new SimHttpApiRequest({
        method: request.method,
        path: new URL(request.url).pathname,
      }),
    );

    if (match === undefined) {
      return this.errorResponse.notFound();
    }

    // The client's own authorization comes first: a request with no
    // credentials is refused whether or not the integration behind the route
    // would work.
    const authorization = await this.routeAuthorizer.authorize({
      api,
      match,
      request,
      caller: serviceRequest.caller,
      iam: this.router.iamFor(api),
    });

    if (!authorization.admitted) {
      return this.refusalResponse.build(authorization);
    }

    return await this.integration.invoke({
      api,
      match,
      request,
      authorization,
    });
  }
}
