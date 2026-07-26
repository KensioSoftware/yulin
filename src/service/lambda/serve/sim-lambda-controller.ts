import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimLambdaUrlEventBuilder } from "./event/sim-lambda-url-event-builder.js";
import { SimLambdaUrlErrorResponse } from "./response/sim-lambda-url-error-response.js";
import { SimLambdaUrlResponseBuilder } from "./response/sim-lambda-url-response-builder.js";
import {
  type SimLambdaFunctionUrlRoute,
  SimLambdaUrlRouter,
} from "./sim-lambda-url-router.js";

interface SimLambdaServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimLambdaUrlRouter;
}

/**
 * Localhost HTTP controller for simulated Lambda Function URLs.
 *
 * A Function URL is invoked without an SDK caller: on real AWS a NONE auth
 * URL is invokable by anyone, so the request is not attributed to a simulated
 * principal. The function itself still runs as its execution Role, as it does
 * for any other invocation.
 */
export class SimLambdaServiceController implements SimAwsServiceController {
  private readonly router: SimLambdaUrlRouter;
  private readonly eventBuilder: SimLambdaUrlEventBuilder;
  private readonly responseBuilder = new SimLambdaUrlResponseBuilder();
  private readonly errorResponse = new SimLambdaUrlErrorResponse();

  constructor(properties: SimLambdaServiceControllerProperties = {}) {
    const { simAws = new SimAws() } = properties;
    this.router = properties.router ?? new SimLambdaUrlRouter({ simAws });
    // Taken from the router rather than from properties, so a supplied router
    // and the event timestamps always belong to the same simulation.
    this.eventBuilder = new SimLambdaUrlEventBuilder({
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

    // The request now arrives with a resolved principal, but nothing yet
    // evaluates lambda:InvokeFunctionUrl against it, so an IAM-authenticated
    // URL still has no way to admit a request. Refusing is the safe direction:
    // it matches what an unauthorized request to a real AWS_IAM Function URL
    // gets.
    if (route.functionUrl.authType === "AWS_IAM") {
      return this.errorResponse.forbidden();
    }

    return await this.invoke(route, serviceRequest.request);
  }

  private async invoke(
    route: SimLambdaFunctionUrlRoute,
    request: Request,
  ): Promise<Response> {
    try {
      const event = await this.eventBuilder.build(request, route.functionUrl);

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
