import { SimPayload1EventBuilder } from "../../../serve/payload-1/sim-payload-1-event-builder.js";
import { SimPayload1ResponseBuilder } from "../../../serve/payload-1/sim-payload-1-response-builder.js";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import { SimLambdaServiceInvokeAuthorizer } from "../../lambda/command/authorize/sim-lambda-service-invoke-authorizer.js";
import type { SimRestApiMatch } from "../api/match/sim-rest-api-match.js";
import { SimRestApiExecuteApiArn } from "../api/sim-rest-api-execute-api-arn.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { simApiGatewayServicePrincipal } from "../sim-api-gateway-service-principal.js";
import { SimApiGatewayErrorResponse } from "./sim-api-gateway-error-response.js";
import type { SimApiGatewayRouter } from "./sim-api-gateway-router.js";
import { simRestApiEndpoint } from "./sim-rest-api-endpoint.js";
import type { SimRestApiFunctionTarget } from "./sim-rest-api-function-target.js";

interface SimRestApiIntegrationInvocationProperties {
  readonly router: SimApiGatewayRouter;
  /** Clock the invocation event is stamped with. */
  readonly clock: SimClock;
}

interface SimRestApiIntegrationInvocationInput {
  readonly restApi: SimRestApi;
  readonly match: SimRestApiMatch;
  readonly request: Request;
}

/**
 * Invokes the Lambda function behind the matched method's integration, and
 * turns what it returns into the HTTP response.
 *
 * A method with no integration, one naming a function that is not there, one
 * the API may not invoke, and one whose handler threw are all the same 502 on
 * real API Gateway, with `Internal server error` in the body and the reason
 * only in the API's own logs.
 */
export class SimRestApiIntegrationInvocation {
  private readonly router: SimApiGatewayRouter;
  private readonly eventBuilder: SimPayload1EventBuilder;
  private readonly responseBuilder = new SimPayload1ResponseBuilder();
  private readonly errorResponse = new SimApiGatewayErrorResponse();

  constructor(properties: SimRestApiIntegrationInvocationProperties) {
    this.router = properties.router;
    this.eventBuilder = new SimPayload1EventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Invoke the integration behind one matched request.
   */
  async invoke(input: SimRestApiIntegrationInvocationInput): Promise<Response> {
    const target = this.integrationTarget(input);

    if (target === undefined) {
      return this.errorResponse.badGateway();
    }

    try {
      const event = await this.eventBuilder.build(
        input.request,
        simRestApiEndpoint(input.restApi, input.match),
      );
      const result = await target.simFunction.invoke(event);

      return this.responseBuilder.isStructuredResult(result)
        ? this.responseBuilder.build(result)
        : this.errorResponse.badGateway();
    } catch {
      // Real API Gateway reports an unhandled integration error as a 502, with
      // the error itself only visible in the function's logs. Reading the
      // request body can fail the same way, so building the event is inside
      // this too.
      return this.errorResponse.badGateway();
    }
  }

  /**
   * The function this request's method invokes, where there is one the API is
   * allowed to invoke.
   */
  private integrationTarget(
    input: SimRestApiIntegrationInvocationInput,
  ): SimRestApiFunctionTarget | undefined {
    const { integration } = input.match.method;

    if (integration === undefined) {
      return undefined;
    }

    const target = this.router.functionFor(integration.lambdaUri);

    return target === undefined || this.mayNotInvoke(input, target)
      ? undefined
      : target;
  }

  /**
   * Whether the API lacks permission to invoke the integrated function.
   *
   * The method the request matched is supplied as the source ARN, so a
   * permission granted for one method does not open another.
   */
  private mayNotInvoke(
    input: SimRestApiIntegrationInvocationInput,
    target: SimRestApiFunctionTarget,
  ): boolean {
    const { restApi, match, request } = input;

    return new SimLambdaServiceInvokeAuthorizer({ iam: target.iam }).authorize({
      resource: target.resource,
      servicePrincipal: simApiGatewayServicePrincipal,
      sourceArn: SimRestApiExecuteApiArn.forMatch(
        restApi,
        match,
        request.method,
      ).toString(),
      sourceAccount: restApi.accountRegionScope.accountId,
    }).isDenied;
  }
}
