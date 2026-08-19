import type { SimRestApiIntegration } from "../../api/method/sim-rest-api-integration.js";
import type { SimRestApiMethod } from "../../api/method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import { SimApiGatewayNotFound } from "../../error/sim-api-gateway.error.js";

/**
 * The rules about reaching a method of a resource, and the integration behind
 * it.
 */
export class SimRestApiMethodRules {
  /**
   * Get a method declared on a resource, refusing one it has not got.
   */
  requireMethod(
    resource: SimRestApiResource,
    httpMethod: string,
  ): SimRestApiMethod {
    const method = resource.findMethod(httpMethod);

    if (method === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid method identifier specified: ${httpMethod} on ${resource.path}`,
      );
    }

    return method;
  }

  /**
   * Get what a method does with a request, refusing a method with nothing
   * behind it. Real API Gateway answers such a method with a 500.
   */
  requireIntegration(method: SimRestApiMethod): SimRestApiIntegration {
    const { integration } = method;

    if (integration === undefined) {
      throw new SimApiGatewayNotFound(
        `No integration defined for method ${method.httpMethod}`,
      );
    }

    return integration;
  }
}
