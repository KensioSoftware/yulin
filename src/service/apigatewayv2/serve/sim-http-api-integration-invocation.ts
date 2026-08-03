import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimHttpApiAdmitted } from "../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiMatch } from "../api/sim-http-api-match.js";
import { SimHttpApiExecuteApiArn } from "../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimHttpApiInvokeAuthorizer } from "./auth/sim-http-api-invoke-authorizer.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import type {
  SimApiGatewayV2Router,
  SimHttpApiFunctionTarget,
} from "./sim-api-gateway-v2-router.js";
import { simHttpApiEndpoint } from "./sim-http-api-endpoint.js";

interface SimHttpApiIntegrationInvocationProperties {
  readonly router: SimApiGatewayV2Router;
  /** Clock the invocation event is stamped with. */
  readonly clock: SimClock;
}

interface SimHttpApiIntegrationInvocationInput {
  readonly api: SimHttpApi;
  readonly match: SimHttpApiMatch;
  readonly request: Request;
  /** What the route's authorization knows about the caller. */
  readonly authorization: SimHttpApiAdmitted;
}

/**
 * Invokes the Lambda function behind the matched route's integration, and
 * turns what it returns into the HTTP response.
 *
 * Whether the API may invoke the function is asked first, and is the API's own
 * question rather than the client's: the client's was already answered by the
 * route's authorization. A function that is not there, one the API may not
 * invoke, and one that failed are the same 500, as they are on real AWS.
 */
export class SimHttpApiIntegrationInvocation {
  private readonly router: SimApiGatewayV2Router;
  private readonly eventBuilder: SimPayload2EventBuilder;
  private readonly responseBuilder = new SimPayload2ResponseBuilder();
  private readonly errorResponse = new SimApiGatewayV2ErrorResponse();

  constructor(properties: SimHttpApiIntegrationInvocationProperties) {
    this.router = properties.router;
    this.eventBuilder = new SimPayload2EventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Invoke the integration for one authorized request.
   */
  async invoke(input: SimHttpApiIntegrationInvocationInput): Promise<Response> {
    const { api, match, request, authorization } = input;
    const target = this.router.targetFor(match.integration);

    if (target === undefined || this.mayNotInvoke(input, target)) {
      // The integration names a function that is not there, or one that
      // granted the API nothing. Real API Gateway discovers both only when it
      // tries to invoke, answers 500, and leaves the reason in its own logs.
      return this.errorResponse.internalServerError();
    }

    try {
      const event = await this.eventBuilder.build(
        request,
        simHttpApiEndpoint(api, match),
        {
          jwt: authorization.jwt,
          caller: authorization.caller,
          lambda: authorization.lambda,
        },
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
   * Whether the API lacks permission to invoke the integrated function.
   *
   * The route the request matched is supplied as the source ARN, so a
   * permission granted for one route does not open another.
   */
  private mayNotInvoke(
    input: SimHttpApiIntegrationInvocationInput,
    target: SimHttpApiFunctionTarget,
  ): boolean {
    const { api, match, request } = input;

    return new SimHttpApiInvokeAuthorizer({ iam: target.iam }).authorize({
      api,
      simFunction: target.simFunction,
      sourceArn: SimHttpApiExecuteApiArn.forMatchedRoute(
        api,
        match,
        request.method,
      ),
    }).isDenied;
  }
}
