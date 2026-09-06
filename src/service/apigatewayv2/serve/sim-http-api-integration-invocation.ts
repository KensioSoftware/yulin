import { SimPayload2EventBuilder } from "../../../serve/payload-2/sim-payload-2-event-builder.js";
import { SimPayload2ResponseBuilder } from "../../../serve/payload-2/sim-payload-2-response-builder.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import type { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { simHttpApiMayNotInvoke } from "./sim-http-api-may-invoke.js";
import { simHttpApiEndpoint } from "./sim-http-api-endpoint.js";
import type { SimHttpApiIntegrationInvocationInput } from "./sim-http-api-integration-input.js";
import {
  type SimHttpApiIntegrationOutcome,
  simHttpApiIntegrationFailure,
} from "./sim-http-api-integration-outcome.js";

interface SimHttpApiIntegrationInvocationProperties {
  readonly router: SimApiGatewayV2Router;
  /** Clock the invocation event is stamped with. */
  readonly clock: SimClock;
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
  async invoke(
    input: SimHttpApiIntegrationInvocationInput,
  ): Promise<SimHttpApiIntegrationOutcome> {
    const { match, request, authorization } = input;
    const target = this.router.targetFor(match.integration);

    if (target === undefined || simHttpApiMayNotInvoke(input, target)) {
      // The integration names a function that is not there, or one that
      // granted the API nothing. Real API Gateway discovers both only when it
      // tries to invoke, answers 500, and leaves the reason in its own logs.
      return this.failed("The integration could not be invoked");
    }

    try {
      const event = await this.eventBuilder.build(
        request,
        simHttpApiEndpoint(input),
        {
          jwt: authorization.jwt,
          caller: authorization.caller,
          lambda: authorization.lambda,
        },
      );

      const response = this.responseBuilder.build(
        await target.simFunction.invoke(event),
      );

      // Lambda answered the invocation, whatever the handler then returned.
      // That is the distinction between the two statuses AWS logs.
      return {
        response,
        integrationStatus: response.status,
        lambdaInvokeStatus: 200,
      };
    } catch (error) {
      // Real API Gateway reports an unhandled integration error as a 500, with
      // the error itself only visible in the function's logs. Reading the
      // request body can fail the same way, so building the event is inside
      // this too.
      return this.failed(error);
    }
  }

  /** The 500 answered whenever a handler was never reached. */
  private failed(error: unknown): SimHttpApiIntegrationOutcome {
    return simHttpApiIntegrationFailure(
      this.errorResponse.internalServerError(),
      error,
    );
  }
}
