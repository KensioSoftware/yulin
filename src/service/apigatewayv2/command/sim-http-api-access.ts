import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimHttpApiStore } from "../api/sim-http-api-store.js";
import type { SimHttpApi } from "../api/sim-http-api.js";
import { SimApiGatewayV2NotFound } from "../error/sim-api-gateway-v2.error.js";
import type {
  SimApiGatewayV2Authorizer,
  SimApiGatewayV2Method,
} from "./authorize/sim-api-gateway-v2-authorizer.js";

/**
 * The collection path every API in one Account and Region is addressed under.
 */
export const simApiGatewayV2ApisPath = "/apis";

interface SimHttpApiAccessProperties {
  readonly apis: SimHttpApiStore;
  readonly authorizer: SimApiGatewayV2Authorizer;
}

interface SimHttpApiRequest {
  readonly method: SimApiGatewayV2Method;
  readonly apiId: string;
  /**
   * The path of the child collection the command addresses, such as
   * `/routes`. Absent for a command addressing the API itself.
   */
  readonly childPath?: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Reaching an API for a command: authorization first, then the lookup.
 *
 * That order is the one real AWS uses, and it is the reason a caller with no
 * permission is told so rather than being told the API does not exist. Every
 * command needing an API goes through here so neither half can be forgotten.
 */
export class SimHttpApiAccess {
  private readonly apis: SimHttpApiStore;
  private readonly authorizer: SimApiGatewayV2Authorizer;

  constructor(properties: SimHttpApiAccessProperties) {
    this.apis = properties.apis;
    this.authorizer = properties.authorizer;
  }

  /**
   * Authorize a command against the API collection itself, which is what
   * creating and listing APIs address.
   */
  authorizeCollection(
    method: SimApiGatewayV2Method,
    caller?: SimAwsCaller,
  ): void {
    this.authorizer.authorize(method, simApiGatewayV2ApisPath, caller);
  }

  /**
   * Get the API a command names, once the caller is allowed to address it.
   */
  api(request: SimHttpApiRequest): SimHttpApi {
    const path = `${simApiGatewayV2ApisPath}/${request.apiId}${request.childPath ?? ""}`;
    this.authorizer.authorize(request.method, path, request.caller);

    const found = this.apis.find(request.apiId);

    if (found === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No API with id ${request.apiId} in this Account and Region`,
      );
    }

    return found;
  }
}
