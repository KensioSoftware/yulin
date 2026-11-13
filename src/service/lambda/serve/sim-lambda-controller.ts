import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simLambdaUrlEndpoint } from "./event/sim-lambda-url-endpoint.js";
import { SimLambdaUrlCorsHeaders } from "./response/sim-lambda-url-cors-headers.js";
import { SimLambdaUrlErrorResponse } from "./response/sim-lambda-url-error-response.js";
import {
  type SimLambdaFunctionUrlRoute,
  SimLambdaUrlRouter,
} from "./sim-lambda-url-router.js";
import { SimLambdaUrlAdmission } from "./auth/sim-lambda-url-admission.js";
import type { SimAwsRequestCaller } from "../../iam/request/sim-aws-request-caller.js";

interface SimLambdaServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimLambdaUrlRouter;
}

/**
 * Localhost HTTP controller for simulated Lambda Function URLs.
 *
 * Every request needs `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`
 * on the function. A NONE auth URL authenticates nobody, so the request is
 * judged as anonymous and only a resource policy open to everyone admits it.
 * An AWS_IAM URL judges the principal resolved at the HTTP boundary.
 *
 * Either way the function itself runs as its execution Role, as it does for
 * any other invocation. Who invoked it and what it runs as are separate
 * questions on real Lambda, and stay separate here.
 *
 * A URL configured for CORS answers a preflight request itself, once the
 * request has got past whatever its auth type asks of it. A browser cannot sign
 * a preflight, and an `AWS_IAM` URL refuses one on the same terms it refuses
 * any other unsigned request.
 */
export class SimLambdaServiceController implements SimAwsServiceController {
  private readonly router: SimLambdaUrlRouter;
  private readonly eventBuilder: SimPayload2EventBuilder;
  private readonly responseBuilder = new SimPayload2ResponseBuilder();
  private readonly errorResponse = new SimLambdaUrlErrorResponse();
  private readonly admission = new SimLambdaUrlAdmission();

  constructor(properties: SimLambdaServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimLambdaUrlRouter({ simAws });
    // Taken from the router rather than from properties, so a supplied router
    // and the event timestamps always belong to the same simulation.
    this.eventBuilder = new SimPayload2EventBuilder({
      clock: this.router.simAws,
    });
  }

  /**
   * Handle an HTTP request routed to a simulated Lambda Function URL.
   */
  async handleRequest(serviceRequest: SimAwsServiceRequest): Promise<Response> {
    const route = this.router.route(serviceRequest.target);

    if (route === undefined) {
      return this.errorResponse.notFound();
    }

    const admission = await this.admission.admit(route, serviceRequest);

    if (!admission.admitted) {
      return admission.response;
    }

    return await this.invoke(route, serviceRequest.request, admission.caller);
  }

  /**
   * Serve a request the Function URL has admitted.
   *
   * CORS is settled around the invocation. A preflight is answered from the
   * configuration alone, and every other response carries the configured
   * headers alongside whatever the handler sent, including a duplicate where
   * the two disagree.
   */
  private async invoke(
    route: SimLambdaFunctionUrlRoute,
    request: Request,
    authenticatedCaller?: SimAwsRequestCaller,
  ): Promise<Response> {
    const { cors } = route.functionUrl;

    if (cors === undefined) {
      return await this.invokeFunction(route, request, authenticatedCaller);
    }

    const corsHeaders = new SimLambdaUrlCorsHeaders(cors);

    if (corsHeaders.isPreflight(request)) {
      return corsHeaders.preflightResponse(request);
    }

    const response = await this.invokeFunction(
      route,
      request,
      authenticatedCaller,
    );
    corsHeaders.apply(response.headers, request);

    return response;
  }

  private async invokeFunction(
    route: SimLambdaFunctionUrlRoute,
    request: Request,
    authenticatedCaller?: SimAwsRequestCaller,
  ): Promise<Response> {
    try {
      const event = await this.eventBuilder.build(
        request,
        simLambdaUrlEndpoint(route.functionUrl),
        { caller: authenticatedCaller },
      );

      return this.responseBuilder.build(await route.simFunction.invoke(event));
    } catch {
      // Real Function URLs report an unhandled function error as a bad
      // gateway, with the error itself only visible in the function's logs.
      // Reading the request body can fail the same way, so building the event
      // is inside this too.
      return this.errorResponse.internalServerError();
    }
  }
}
