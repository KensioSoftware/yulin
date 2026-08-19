import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimRestApiStore } from "../api/sim-rest-api-store.js";
import type { SimRestApi } from "../api/sim-rest-api.js";
import { SimApiGatewayNotFound } from "../error/sim-api-gateway.error.js";
import type {
  SimApiGatewayAuthorizer,
  SimApiGatewayMethod,
} from "./authorize/sim-api-gateway-authorizer.js";

/**
 * The collection path every REST API in one Account and Region is addressed
 * under.
 */
export const simApiGatewayRestApisPath = "/restapis";

interface SimRestApiAccessProperties {
  readonly apis: SimRestApiStore;
  readonly authorizer: SimApiGatewayAuthorizer;
}

interface SimRestApiAccessRequest {
  readonly method: SimApiGatewayMethod;
  readonly restApiId: string;
  /**
   * The path of the child collection the command addresses, such as
   * `/resources`. Absent for a command addressing the API itself.
   */
  readonly childPath?: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Reaching a REST API for a command: authorization first, then the lookup.
 *
 * That order is the one real AWS uses, and it is why a caller with no
 * permission is told so rather than being told the API is absent. Every
 * command needing an API goes through here so neither half can be forgotten.
 */
export class SimRestApiAccess {
  private readonly apis: SimRestApiStore;
  private readonly authorizer: SimApiGatewayAuthorizer;

  constructor(properties: SimRestApiAccessProperties) {
    this.apis = properties.apis;
    this.authorizer = properties.authorizer;
  }

  /**
   * Authorize a command against the REST API collection itself, which is what
   * creating and listing APIs address.
   */
  authorizeCollection(
    method: SimApiGatewayMethod,
    caller?: SimAwsCaller,
  ): void {
    this.authorizer.authorize(method, simApiGatewayRestApisPath, caller);
  }

  /**
   * Get the API a command names, once the caller is allowed to address it.
   */
  api(request: SimRestApiAccessRequest): SimRestApi {
    const path = `${simApiGatewayRestApisPath}/${request.restApiId}${request.childPath ?? ""}`;
    this.authorizer.authorize(request.method, path, request.caller);

    const found = this.apis.find(request.restApiId);

    if (found === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid REST API identifier specified: ${request.restApiId}`,
      );
    }

    return found;
  }
}
