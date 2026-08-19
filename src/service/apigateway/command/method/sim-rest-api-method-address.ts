import type { SimRestApiMethod } from "../../api/method/sim-rest-api-method.js";
import type { SimRestApiResource } from "../../api/resource/sim-rest-api-resource.js";
import type { SimApiGatewayRequestOptions } from "../sim-api-gateway-request-options.js";
import { SimApiGatewayUnsimulatedInput } from "../sim-api-gateway-unsimulated-input.js";
import type { SimRestApiAccess } from "../sim-rest-api-access.js";
import { simRestApiHttpMethodOf } from "./sim-rest-api-http-method.js";
import { SimRestApiMethodRules } from "./sim-rest-api-method-rules.js";

/**
 * The three inputs every command addressing one method takes.
 */
export const simRestApiMethodOptions = [
  "restApiId",
  "resourceId",
  "httpMethod",
];

/**
 * What a command names when it addresses one method.
 */
export interface SimRestApiMethodAddressInput {
  readonly restApiId?: string | undefined;
  readonly resourceId?: string | undefined;
  readonly httpMethod?: string | undefined;
}

/**
 * The resource and HTTP method a command addressed.
 */
export interface SimRestApiMethodTarget {
  readonly resource: SimRestApiResource;
  readonly httpMethod: string;
}

/**
 * A target whose method is declared, which is what every command other than
 * `PutMethod` needs.
 */
export interface SimRestApiDeclaredMethod extends SimRestApiMethodTarget {
  readonly method: SimRestApiMethod;
}

interface SimRestApiMethodAddressProperties {
  readonly access: SimRestApiAccess;
}

/**
 * Resolves the resource and HTTP method a command addresses.
 *
 * The method commands and the integration commands address a method the same
 * way, by API, resource id and HTTP method, so both reach it through here.
 */
export class SimRestApiMethodAddress {
  private readonly access: SimRestApiAccess;
  private readonly rules = new SimRestApiMethodRules();

  constructor(properties: SimRestApiMethodAddressProperties) {
    this.access = properties.access;
  }

  /**
   * The resource and HTTP method a command addresses, once the caller is
   * allowed to address them. The method itself need not be declared yet, which
   * is the case `PutMethod` is in.
   */
  target(
    accessMethod: "GET" | "PUT" | "DELETE",
    operation: string,
    input: SimRestApiMethodAddressInput,
    options?: SimApiGatewayRequestOptions,
  ): SimRestApiMethodTarget {
    const unsimulated = new SimApiGatewayUnsimulatedInput(operation);
    const restApiId = unsimulated.require("restApiId", input.restApiId);
    const resourceId = unsimulated.require("resourceId", input.resourceId);
    const httpMethod = simRestApiHttpMethodOf(
      operation,
      unsimulated.require("httpMethod", input.httpMethod),
    );

    const restApi = this.access.api({
      method: accessMethod,
      restApiId,
      childPath: `/resources/${resourceId}/methods/${httpMethod}`,
      caller: options?.caller,
    });

    return { resource: restApi.requireResource(resourceId), httpMethod };
  }

  /**
   * The method a command addresses, refusing one that is not declared.
   */
  declared(
    accessMethod: "GET" | "PUT" | "DELETE",
    operation: string,
    input: SimRestApiMethodAddressInput,
    options?: SimApiGatewayRequestOptions,
  ): SimRestApiDeclaredMethod {
    const target = this.target(accessMethod, operation, input, options);

    return {
      ...target,
      method: this.rules.requireMethod(target.resource, target.httpMethod),
    };
  }
}
