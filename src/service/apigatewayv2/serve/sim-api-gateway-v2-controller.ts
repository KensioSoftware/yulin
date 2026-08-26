import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimHttpApiRouteAuthorizer } from "./auth/sim-http-api-route-authorizer.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { SimHttpApiIntegrationInvocation } from "./sim-http-api-integration-invocation.js";
import { SimHttpApiRefusalResponse } from "./sim-http-api-refusal-response.js";
import {
  type SimHttpApiServing,
  SimHttpApiServingResolver,
} from "./sim-http-api-serving.js";

interface SimApiGatewayV2ServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimApiGatewayV2Router;
}

/**
 * Localhost HTTP controller for simulated API Gateway HTTP APIs.
 *
 * A request reaching the generated endpoint, or a custom domain mapped to the
 * API, is matched to a route, and the route's integration invokes a simulated
 * Lambda function with a payload format 2.0 event. The function runs as its execution Role, as it does for
 * any other invocation.
 *
 * The stage's throttle comes before any of that. A route whose bucket is empty
 * is answered 429, and neither its authorizer nor its integration runs.
 *
 * A route that authorizes anybody is checked next: a JWT route's
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
  private readonly serving: SimHttpApiServingResolver;
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
    this.serving = new SimHttpApiServingResolver({ router: this.router });
  }

  /**
   * Handle an HTTP request routed to a simulated HTTP API.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const resolution = this.serving.resolve(
      serviceRequest.target,
      serviceRequest.request,
    );

    switch (resolution.kind) {
      case "notFound": {
        return this.errorResponse.notFound();
      }
      case "refusedHost": {
        return this.errorResponse.forbiddenHost();
      }
      case "served": {
        return await this.invoke(resolution.serving, serviceRequest);
      }
    }
  }

  private async invoke(
    serving: SimHttpApiServing,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { request } = serviceRequest;
    const { api, match } = serving;

    // The stage's throttle is asked before the route's authorizer. A flood of
    // requests to a throttled route invokes neither. AWS publishes no order
    // between the two.
    if (!match.stage.admits(match.route.routeKey)) {
      return this.errorResponse.tooManyRequests();
    }

    // The client's own authorization comes next: a request with no
    // credentials is refused whether or not the integration behind the route
    // would work.
    const authorization = await this.routeAuthorizer.authorize({
      api,
      match,
      request,
      caller: serviceRequest.caller,
      iam: this.router.iamFor(api),
      domainName: serving.domainName,
      rawPath: serving.rawPath,
    });

    if (!authorization.admitted) {
      return this.refusalResponse.build(authorization);
    }

    return await this.integration.invoke({
      api,
      match,
      request,
      authorization,
      domainName: serving.domainName,
      rawPath: serving.rawPath,
    });
  }
}
