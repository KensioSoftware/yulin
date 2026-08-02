import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimHttpApiRequest } from "../api/sim-http-api-request.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
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
 * Every simulated route is `AuthorizationType: NONE`, so nothing here refuses
 * a caller. A request that reached the endpoint reaches the integration.
 */
export class SimApiGatewayV2ServiceController implements SimAwsServiceController {
  private readonly router: SimApiGatewayV2Router;
  private readonly eventBuilder: SimPayload2EventBuilder;
  private readonly responseBuilder = new SimPayload2ResponseBuilder();
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();

  constructor(properties: SimApiGatewayV2ServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimApiGatewayV2Router({ simAws });
    // Taken from the router rather than from properties, so a supplied router
    // and the event timestamps always belong to the same simulation.
    this.eventBuilder = new SimPayload2EventBuilder({
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

    return await this.invoke(httpApi, serviceRequest.request);
  }

  private async invoke(api: SimHttpApi, request: Request): Promise<Response> {
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

    const simFunction = this.router.functionFor(match.integration);

    if (simFunction === undefined) {
      // The integration names a function that is not there, which real API
      // Gateway discovers the same way: only when it tries to invoke it.
      return this.errorResponse.internalServerError();
    }

    try {
      const event = await this.eventBuilder.build(
        request,
        simHttpApiEndpoint(api, match),
      );

      return this.responseBuilder.build(await simFunction.invoke(event));
    } catch {
      // Real API Gateway reports an unhandled integration error as a 500, with
      // the error itself only visible in the function's logs. Reading the
      // request body can fail the same way, so building the event is inside
      // this too.
      return this.errorResponse.internalServerError();
    }
  }
}
