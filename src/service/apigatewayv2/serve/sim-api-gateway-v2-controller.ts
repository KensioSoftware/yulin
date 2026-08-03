import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimHttpApiRefused } from "../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiExecuteApiArn } from "../api/sim-http-api-execute-api-arn.js";
import { SimHttpApiRequest } from "../api/sim-http-api-request.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimHttpApiIntegrationAuthorizer } from "./auth/sim-http-api-integration-authorizer.js";
import { SimHttpApiRouteAuthorizer } from "./auth/sim-http-api-route-authorizer.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { simHttpApiEndpoint } from "./sim-http-api-endpoint.js";

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
 * token has to verify and meet the route's scopes, and an `AWS_IAM` route's
 * caller has to be allowed `execute-api:Invoke` on the route, or the request is
 * refused and the function is never invoked. Whether the API may invoke the
 * function is a separate question, and the API's own rather than the client's.
 */
export class SimApiGatewayV2ServiceController implements SimAwsServiceController {
  private readonly router: SimApiGatewayV2Router;
  private readonly eventBuilder: SimPayload2EventBuilder;
  private readonly routeAuthorizer: SimHttpApiRouteAuthorizer;
  private readonly responseBuilder = new SimPayload2ResponseBuilder();
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();

  constructor(properties: SimApiGatewayV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimApiGatewayV2Router({ simAws });
    // Taken from the router rather than from properties, so a supplied router,
    // the event timestamps and the token expiry checks all belong to the same
    // simulation.
    this.eventBuilder = new SimPayload2EventBuilder({
      clock: this.router.simAws,
    });
    this.routeAuthorizer = new SimHttpApiRouteAuthorizer({
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
    const authorization = this.routeAuthorizer.authorize({
      api,
      match,
      request,
      caller: serviceRequest.caller,
      iam: this.router.iamFor(api),
    });

    if (!authorization.admitted) {
      return this.refusalResponse(authorization);
    }

    const target = this.router.targetFor(match.integration);

    if (target === undefined) {
      // The integration names a function that is not there, which real API
      // Gateway discovers the same way: only when it tries to invoke it.
      return this.errorResponse.internalServerError();
    }

    const decision = new SimHttpApiIntegrationAuthorizer({
      iam: target.iam,
    }).authorize({
      simFunction: target.simFunction,
      sourceArn: new SimHttpApiExecuteApiArn({
        api,
        stageName: match.stage.stageName,
        methodAndPath: match.route.key.methodAndPath(request.method),
      }),
    });

    if (decision.isDenied) {
      // Real API Gateway answers a missing invoke permission with a 500 and
      // never invokes the function, which is the same answer as an integration
      // that failed. The refusal is only visible in the API's own logs.
      return this.errorResponse.internalServerError();
    }

    try {
      const event = await this.eventBuilder.build(
        request,
        simHttpApiEndpoint(api, match),
        { jwt: authorization.jwt, caller: authorization.caller },
      );

      return this.responseBuilder.build(await target.simFunction.invoke(event));
    } catch {
      // Real API Gateway reports an unhandled integration error as a 500, with
      // the error itself only visible in the function's logs. Reading the
      // request body can fail the same way, so building the event is inside
      // this too.
      return this.errorResponse.internalServerError();
    }
  }

  /**
   * The response a refused request gets back.
   *
   * A 403 is an unmet route scope, where the token was accepted and does not
   * allow this route, or an `AWS_IAM` route IAM did not allow the caller.
   * Everything else is one 401.
   */
  private refusalResponse(refused: SimHttpApiRefused): Response {
    if (refused.kind === "forbidden") {
      return this.errorResponse.forbidden();
    }

    return this.errorResponse.unauthorized(refused.errorDescription);
  }
}
