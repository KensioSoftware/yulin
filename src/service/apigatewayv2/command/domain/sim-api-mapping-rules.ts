import type { SimHttpApiStore } from "../../api/sim-http-api-store.js";
import type { SimApiMappingKey } from "../../domain/sim-api-mapping-key.js";
import type { SimApiMapping } from "../../domain/sim-api-mapping.js";
import type { SimHttpApiDomainName } from "../../domain/sim-http-api-domain-name.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

/**
 * What an API mapping has to hold before a domain will serve anything through
 * it.
 *
 * Each of these is checked when the mapping is made rather than when a request
 * arrives, which is where real API Gateway checks them too. A mapping naming a
 * stage that is not there would otherwise answer 404 on every request, far
 * from the command that made it.
 */
export class SimApiMappingRules {
  private readonly apis: SimHttpApiStore;

  constructor(apis: SimHttpApiStore) {
    this.apis = apis;
  }

  /**
   * Require the API and the stage a mapping is about to point at.
   */
  requireStage(apiId: string, stage: string): void {
    const httpApi = this.apis.find(apiId);

    if (httpApi === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No API with id ${apiId} in this Account and Region`,
      );
    }

    if (httpApi.stages.find(stage) === undefined) {
      throw new SimApiGatewayV2BadRequest(
        `No stage named ${stage} on API ${apiId}`,
      );
    }
  }

  /**
   * Require a base path this domain does not already serve, since one base
   * path serves one API.
   */
  requireUnusedKey(
    domain: SimHttpApiDomainName,
    apiMappingKey: SimApiMappingKey,
  ): void {
    if (domain.apiMappings.findByKey(apiMappingKey.value) === undefined) {
      return;
    }

    const base =
      apiMappingKey.depth === 0
        ? "the root of the domain"
        : `the base path '${apiMappingKey.value}'`;

    throw new SimApiGatewayV2Conflict(
      `Domain name ${domain.domainName} already maps ${base}`,
    );
  }

  /**
   * Get the mapping a command names, or refuse.
   */
  requireMapping(
    domain: SimHttpApiDomainName,
    apiMappingId: string,
  ): SimApiMapping {
    const mapping = domain.apiMappings.find(apiMappingId);

    if (mapping === undefined) {
      throw new SimApiGatewayV2NotFound(
        `No API mapping ${apiMappingId} on domain name ${domain.domainName}`,
      );
    }

    return mapping;
  }
}
