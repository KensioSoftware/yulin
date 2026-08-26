import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";
import type { SimHttpApiDomainRegistry } from "../registry/sim-http-api-domain-registry.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

/**
 * Routes a served request that reached a custom domain name.
 *
 * A custom domain hostname says nothing about the Account or the Region it was
 * created in, so the registry holding every domain in the simulation is the
 * only way from the hostname to the domain. An API mapping then names an API
 * id, and the API is looked up in the domain's own scope, because a domain and
 * the APIs it maps are in one Account and Region on real AWS.
 */
export class SimHttpApiDomainRouter {
  private readonly simAws: SimAws;
  private readonly domains: SimHttpApiDomainRegistry;

  constructor(simAws: SimAws) {
    this.simAws = simAws;
    this.domains = simAws.serviceFactory.registries.httpApiDomains;
  }

  /**
   * Find the custom domain name a request target addresses.
   */
  route(target: SimAwsServiceTarget): SimHttpApiDomainName | undefined {
    return this.domains.findByHost(target.resourceName);
  }

  /**
   * Find an API a mapping of this domain names.
   */
  mappedApi(
    domain: SimHttpApiDomainName,
    apiId: string,
  ): SimHttpApi | undefined {
    const { accountId, regionName } = domain.accountRegionScope;

    return this.simAws
      .accountRegionScope(accountId, regionName)
      .apiGatewayV2()
      .findApi(apiId);
  }
}
