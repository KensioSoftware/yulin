import type {
  SimAwsServiceController,
  SimAwsServiceRequest,
} from "../../../serve/controller/sim-service-controller.js";
import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simLambdaUrlEndpoint } from "./event/sim-lambda-url-endpoint.js";
import { SimLambdaUrlErrorResponse } from "./response/sim-lambda-url-error-response.js";
import {
  type SimLambdaFunctionUrlRoute,
  SimLambdaUrlRouter,
} from "./sim-lambda-url-router.js";
import { SimLambdaUrlAuthorizer } from "./auth/sim-lambda-url-authorizer.js";
import type { SimAwsRequestCaller } from "../../iam/request/sim-aws-request-caller.js";

interface SimLambdaServiceControllerProperties {
  readonly simAws?: SimAws;
  readonly router?: SimLambdaUrlRouter;
}

/**
 * Localhost HTTP controller for simulated Lambda Function URLs.
 *
 * A NONE auth URL is invokable by anyone on real AWS, so the request is not
 * attributed to a simulated principal. An AWS_IAM URL is invokable only by a
 * caller allowed `lambda:InvokeFunctionUrl` on the function, evaluated against
 * the principal resolved at the HTTP boundary.
 *
 * Either way the function itself runs as its execution Role, as it does for
 * any other invocation. Who invoked it and what it runs as are separate
 * questions on real Lambda, and stay separate here.
 */
export class SimLambdaServiceController implements SimAwsServiceController {
  private readonly router: SimLambdaUrlRouter;
  private readonly eventBuilder: SimPayload2EventBuilder;
  private readonly responseBuilder = new SimPayload2ResponseBuilder();
  private readonly errorResponse = new SimLambdaUrlErrorResponse();

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

    if (route.functionUrl.authType === "NONE") {
      // A NONE URL is invokable by anyone on real AWS, so the request is not
      // attributed to a principal and the event describes no caller.
      return await this.invoke(route, serviceRequest.request);
    }

    return await this.invokeAuthenticated(route, serviceRequest);
  }

  /**
   * Invoke through an `AWS_IAM` Function URL, if the caller may.
   *
   * The caller was resolved at the HTTP boundary, from a signature or from a
   * named principal, and is anonymous when the request offered neither.
   * Anonymous owns no policies, so an unsigned request is refused by the same
   * evaluation that admits a permitted one, rather than by a special case.
   *
   * What the request is being made on behalf of travels with it, so a
   * CloudFront Distribution reaching this URL through an origin access control
   * is judged against the Distribution the permission names.
   */
  private async invokeAuthenticated(
    route: SimLambdaFunctionUrlRoute,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<Response> {
    const { caller } = serviceRequest;
    const decision = new SimLambdaUrlAuthorizer({ iam: route.iam }).authorize({
      simFunction: route.simFunction,
      functionUrl: route.functionUrl,
      caller: caller.toCaller(),
      source: serviceRequest.source,
    });

    if (decision.isDenied) {
      return this.errorResponse.forbidden();
    }

    return await this.invoke(route, serviceRequest.request, caller);
  }

  private async invoke(
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
