import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";
import type { SimHttpApiDomainStore } from "../domain/sim-http-api-domain-store.js";
import { SimApiGatewayV2NotFound } from "../error/sim-api-gateway-v2.error.js";
import type {
  SimApiGatewayV2Authorizer,
  SimApiGatewayV2Method,
} from "./authorize/sim-api-gateway-v2-authorizer.js";

/**
 * The collection path every custom domain name in one Account and Region is
 * addressed under.
 */
export const simApiGatewayV2DomainNamesPath = "/domainnames";

interface SimHttpApiDomainAccessProperties {
  readonly domains: SimHttpApiDomainStore;
  readonly authorizer: SimApiGatewayV2Authorizer;
}

interface SimHttpApiDomainRequest {
  readonly method: SimApiGatewayV2Method;
  readonly domainName: string;
  /**
   * The path of the child collection the command addresses, such as
   * `/apimappings`. Absent for a command addressing the domain itself.
   */
  readonly childPath?: string;
  readonly caller?: SimAwsCaller | undefined;
}

/**
 * Reaching a custom domain name for a command, the way `SimHttpApiAccess`
 * reaches an API: authorization first, then the lookup.
 */
export class SimHttpApiDomainAccess {
  private readonly domains: SimHttpApiDomainStore;
  private readonly authorizer: SimApiGatewayV2Authorizer;

  constructor(properties: SimHttpApiDomainAccessProperties) {
    this.domains = properties.domains;
    this.authorizer = properties.authorizer;
  }

  /**
   * Authorize a command against the domain name collection itself, which is
   * what creating and listing domain names address.
   */
  authorizeCollection(
    method: SimApiGatewayV2Method,
    caller?: SimAwsCaller,
  ): void {
    this.authorizer.authorize(method, simApiGatewayV2DomainNamesPath, caller);
  }

  /**
   * Get the domain name a command names, once the caller is allowed to address
   * it.
   */
  domain(request: SimHttpApiDomainRequest): SimHttpApiDomainName {
    const path = `${simApiGatewayV2DomainNamesPath}/${request.domainName}${request.childPath ?? ""}`;
    this.authorizer.authorize(request.method, path, request.caller);

    const found = this.domains.find(request.domainName);

    if (found === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No domain name ${request.domainName} in this Account and Region`,
      );
    }

    return found;
  }
}
