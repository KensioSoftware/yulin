import type { SimClock } from "../../../../util/clock/sim-clock.js";
import {
  type SimHttpApiAuthorization,
  SimHttpApiRefused,
} from "../../api/authorizer/sim-http-api-authorization.js";
import { SimHttpApiRequestAuthorizer } from "../../api/authorizer/sim-http-api-request-authorizer.js";
import type { SimHttpApiLambdaUri } from "../../api/integration/sim-http-api-lambda-uri.js";
import { SimHttpApiExecuteApiArn } from "../../api/sim-http-api-execute-api-arn.js";
import type { SimHttpApi } from "../../api/sim-http-api.js";
import type { SimHttpApiFunctionTarget } from "../sim-api-gateway-v2-router.js";
import { simHttpApiEndpoint } from "../sim-http-api-endpoint.js";
import { SimHttpApiAuthorizerEventBuilder } from "./sim-http-api-authorizer-event.js";
import { SimHttpApiAuthorizerResponse } from "./sim-http-api-authorizer-response.js";
import { SimHttpApiInvokeAuthorizer } from "./sim-http-api-invoke-authorizer.js";
import type { SimHttpApiRouteAuthorizeInput } from "./sim-http-api-route-authorize-input.js";

/**
 * Finds the function an authorizer names, which the serving router does.
 */
export interface SimHttpApiAuthorizerFunctions {
  functionFor(
    lambdaUri: SimHttpApiLambdaUri,
  ): SimHttpApiFunctionTarget | undefined;
}

interface SimHttpApiRequestRouteAuthorizerProperties {
  /** Clock the authorizer's own invocation event is stamped with. */
  readonly clock: SimClock;
  readonly functions: SimHttpApiAuthorizerFunctions;
}

/**
 * Decides whether one request may have a `CUSTOM` route, by invoking the
 * Lambda function the route's authorizer names.
 *
 * The steps are the ones real API Gateway takes, in this order:
 *
 * 1. the request has to carry every identity source the authorizer was
 *    configured with, or it is refused with a 401 and the function is never
 *    invoked;
 * 2. the function has to exist and to allow the API to invoke it, under an ARN
 *    naming the authorizer rather than any route;
 * 3. the function is invoked with the payload format 2.0 authorizer event;
 * 4. what it answered decides, and anything unreadable is a 500.
 *
 * Nothing is cached between requests, so the function is invoked once per
 * request reaching the route. That is what `AuthorizerResultTtlInSeconds: 0`
 * asks for, and it is the only configuration `CreateAuthorizer` accepts.
 */
export class SimHttpApiRequestRouteAuthorizer {
  private readonly functions: SimHttpApiAuthorizerFunctions;
  private readonly eventBuilder: SimHttpApiAuthorizerEventBuilder;

  constructor(properties: SimHttpApiRequestRouteAuthorizerProperties) {
    this.functions = properties.functions;
    this.eventBuilder = new SimHttpApiAuthorizerEventBuilder({
      clock: properties.clock,
    });
  }

  /**
   * Authorize one request against the `CUSTOM` route that matched it.
   */
  async authorize(
    input: SimHttpApiRouteAuthorizeInput,
  ): Promise<SimHttpApiAuthorization> {
    const { api, match, request } = input;
    const authorizer = api.authorizers.find(match.route.authorizerId ?? "");

    // A CUSTOM route always names a REQUEST authorizer, and that authorizer
    // can still be deleted out from under it, so the two come to the same
    // thing here: with nothing to ask, the route stays closed.
    if (!(authorizer instanceof SimHttpApiRequestAuthorizer)) {
      return SimHttpApiRefused.unauthorized();
    }

    const identitySource = authorizer.identitySources.values(request);

    if (identitySource === undefined) {
      return SimHttpApiRefused.unauthorized();
    }

    return await this.invoke(input, authorizer, identitySource);
  }

  /**
   * Invoke the authorizer function and read what it answered.
   */
  private async invoke(
    input: SimHttpApiRouteAuthorizeInput,
    authorizer: SimHttpApiRequestAuthorizer,
    identitySource: readonly string[],
  ): Promise<SimHttpApiAuthorization> {
    const { api, match, request } = input;
    const target = this.functions.functionFor(authorizer.lambdaUri);

    if (target === undefined || this.mayNotInvoke(api, authorizer, target)) {
      // A function that is not there, and one the API may not invoke, are both
      // 500s on real AWS: the caller is told nothing about the API's own
      // wiring.
      return SimHttpApiRefused.error();
    }

    const routeArn = new SimHttpApiExecuteApiArn({
      api,
      stageName: match.stage.stageName,
      methodAndPath: match.route.key.methodAndPath(request.method),
    }).toString();

    try {
      const event = await this.eventBuilder.build({
        request,
        endpoint: simHttpApiEndpoint(api, match),
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

  /**
   * Whether the API lacks permission to invoke the authorizer's function.
   *
   * The source ARN names the authorizer rather than the route, so a function
   * granted the invoke action for the API's routes is not thereby usable as
   * its authorizer, as on real AWS.
   */
  private mayNotInvoke(
    api: SimHttpApi,
    authorizer: SimHttpApiRequestAuthorizer,
    target: SimHttpApiFunctionTarget,
  ): boolean {
    return new SimHttpApiInvokeAuthorizer({ iam: target.iam }).authorize({
      simFunction: target.simFunction,
      sourceArn: SimHttpApiExecuteApiArn.forAuthorizer(
        api,
        authorizer.authorizerId,
      ),
    }).isDenied;
  }
}
