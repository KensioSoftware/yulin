import type { SimAwsServiceRequest } from "../../../serve/controller/sim-service-controller.js";
import { SimHttpApiRouteAuthorizer } from "./auth/sim-http-api-route-authorizer.js";
import { SimApiGatewayV2ErrorResponse } from "./sim-api-gateway-v2-error-response.js";
import type { SimApiGatewayV2Router } from "./sim-api-gateway-v2-router.js";
import { SimHttpApiIntegrationInvocation } from "./sim-http-api-integration-invocation.js";
import { SimHttpApiRefusalResponse } from "./sim-http-api-refusal-response.js";
import type {
  SimHttpApiServed,
  SimHttpApiServedRequest,
} from "./sim-http-api-served.js";

interface SimHttpApiServePipelineProperties {
  readonly router: SimApiGatewayV2Router;
}

/**
 * Takes one request the resolver matched to a stage through the three things
 * that stand between it and a response.
 *
 * The stage's throttle is asked first. A flood of requests to a throttled
 * route invokes neither the authorizer nor the integration, and AWS publishes
 * no order between the two. The client's own authorization comes next, so a
 * request with no credentials is refused whether or not the integration
 * behind the route would work. What each step decided is carried out with the
 * response, because the stage's access log describes the request afterwards
 * and a refused request is the case that log exists for.
 */
export class SimHttpApiServePipeline {
  readonly #router: SimApiGatewayV2Router;
  readonly #routeAuthorizer: SimHttpApiRouteAuthorizer;
  readonly #integration: SimHttpApiIntegrationInvocation;
  readonly #errorResponse = new SimApiGatewayV2ErrorResponse();
  readonly #refusalResponse = new SimHttpApiRefusalResponse();

  constructor(properties: SimHttpApiServePipelineProperties) {
    this.#router = properties.router;
    // The clock is the router's, so the event timestamps and the token expiry
    // checks belong to the same simulation.
    this.#routeAuthorizer = new SimHttpApiRouteAuthorizer({
      clock: properties.router.simAws,
      functions: properties.router,
    });
    this.#integration = new SimHttpApiIntegrationInvocation({
      router: properties.router,
      clock: properties.router.simAws,
    });
  }

  /**
   * Serve one request, and report what each step of serving it decided.
   */
  async run(
    serving: SimHttpApiServedRequest,
    serviceRequest: SimAwsServiceRequest,
  ): Promise<SimHttpApiServed> {
    const { request } = serviceRequest;
    const { api, match, domainName, rawPath, requestId } = serving;
    // What the authorizer's event and the integration's event both describe.
    const asked = { api, match, request, domainName, rawPath, requestId };

    // The throttle takes a token from the route's bucket, and a route whose
    // bucket is empty is answered here. Neither the authorizer nor the
    // integration runs for it, and the stage's access log is the only place
    // the refusal is recorded.
    if (!match.stage.admits(match.route.routeKey)) {
      return { response: this.#errorResponse.tooManyRequests() };
    }

    const authorization = await this.#routeAuthorizer.authorize({
      ...asked,
      caller: serviceRequest.caller,
      iam: this.#router.iamFor(api),
    });

    // A refusal is carried out alongside its response, because the access log
    // line reports what the authorizer said. An unmet route scope, an
    // `AWS_IAM` route IAM did not allow, and a Lambda authorizer that said no
    // all arrive here.
    if (!authorization.admitted) {
      return {
        response: this.#refusalResponse.build(authorization),
        authorization,
      };
    }

    const clock = this.#router.simAws;
    const invokedAt = clock.now().getTime();
    const outcome = await this.#integration.invoke({ ...asked, authorization });
    const integration = {
      ...outcome,
      integrationLatency: clock.now().getTime() - invokedAt,
    };

    return { response: integration.response, authorization, integration };
  }
}
