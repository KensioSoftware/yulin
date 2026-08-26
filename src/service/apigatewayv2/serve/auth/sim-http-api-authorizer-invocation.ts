import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import type { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";
import type { SimHttpApiLambdaUri } from "../../api/integration/sim-http-api-lambda-uri.js";
import { SimHttpApiExecuteApiArn } from "../../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApiFunctionTarget } from "../sim-http-api-function-target.js";
import { simHttpApiEndpoint } from "../sim-http-api-endpoint.js";
import { SimHttpApiAuthorizerEventBuilder } from "./sim-http-api-authorizer-event.js";
import { SimHttpApiAuthorizerResponse } from "./sim-http-api-authorizer-response.js";
import { simHttpApiMayNotInvokeAuthorizer } from "./sim-http-api-invoke-authorizer.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

/**
 * Finds the function an authorizer names, which the serving router does.
 */
export interface SimHttpApiAuthorizerFunctions {
  functionFor(
    lambdaUri: SimHttpApiLambdaUri,
  ): SimHttpApiFunctionTarget | undefined;
}

interface SimHttpApiAuthorizerInvocationProperties {
  /** Clock the authorizer's own invocation event is stamped with. */
  readonly clock: SimClock;
  readonly functions: SimHttpApiAuthorizerFunctions;
}

/**
 * Invokes a Lambda `REQUEST` authorizer's function and reads what it answered.
 *
 * The API's permission to invoke that function is asked first, under an ARN
 * naming the authorizer rather than any route. A function that is not there,
 * one the API may not invoke, and one that failed are the same 500, as they
 * are on real AWS: none of them is anything the caller could act on.
 */
export class SimHttpApiAuthorizerInvocation {
  private readonly functions: SimHttpApiAuthorizerFunctions;
  private readonly eventBuilder: SimHttpApiAuthorizerEventBuilder;

  constructor(properties: SimHttpApiAuthorizerInvocationProperties) {
    this.functions = properties.functions;
    this.eventBuilder = new SimHttpApiAuthorizerEventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Ask the authorizer's function about one request.
   */
  async invoke(
    input: SimHttpApiRouteAuthorizeInput,
    authorizer: SimHttpApiRequestAuthorizer,
    identitySource: readonly string[],
  ): Promise<SimHttpApiAuthorization> {
    const { api, match, request } = input;
    const target = this.functions.functionFor(authorizer.lambdaUri);

    if (
      target === undefined ||
      simHttpApiMayNotInvokeAuthorizer(api, authorizer, target)
    ) {
      return SimHttpApiRefused.error();
    }

    const routeArn = SimHttpApiExecuteApiArn.forMatchedRoute(
      api,
      match,
      request.method,
    ).toString();

    try {
      const event = await this.eventBuilder.build({
        request,
        endpoint: simHttpApiEndpoint(input),
        routeArn,
        identitySource,
      });

      return new SimHttpApiAuthorizerResponse({ authorizer, routeArn }).read(
        await target.simFunction.invoke(event),
      );
    } catch {
      // An authorizer that failed tells the caller nothing, the way an
      // integration that failed does not. Reading the request to build the
      // event can fail the same way, so it is inside this too.
      return SimHttpApiRefused.error();
    }
  }
}
