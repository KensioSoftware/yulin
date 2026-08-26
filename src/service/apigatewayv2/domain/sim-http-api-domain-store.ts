import type { SimHttpApiDomainName } from "./sim-http-api-domain-name.js";

/**
 * The custom domain names of one Account and Region, keyed by domain name,
 * which is what names a domain on real AWS.
 */
export class SimHttpApiDomainStore {
  private readonly domains = new Map<string, SimHttpApiDomainName>();

  /**
   * Add a domain to this scope.
   */
  add(domain: SimHttpApiDomainName): void {
    this.domains.set(domain.domainName.toLowerCase(), domain);
  }

  /**
   * Find a domain by name.
   */
  find(domainName: string): SimHttpApiDomainName | undefined {
    return this.domains.get(domainName.toLowerCase());
  }

  /**
   * Forget a deleted domain.
   */
  remove(domainName: string): void {
    this.domains.delete(domainName.toLowerCase());
  }

  /**
   * List every domain in this scope, in the order they were created.
   */
  list(): SimHttpApiDomainName[] {
    return this.domains.values().toArray();
  }

  /**
   * Forget every API mapping pointing at an API, which is what deleting that
   * API leaves behind on the domains mapping it.
   */
  removeMappingsForApi(apiId: string): void {
    for (const domain of this.list()) {
      domain.apiMappings.removeForApi(apiId);
    }
  }
}
