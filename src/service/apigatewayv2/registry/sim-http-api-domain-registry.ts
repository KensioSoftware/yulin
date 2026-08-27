import { SimAwsHostnameClaims } from "../../../serve/controller/host/sim-aws-hostname-claims.js";
import type { SimAwsServiceHosts } from "../../../serve/controller/host/sim-aws-service-hosts.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { SimHttpApiDomainName } from "../domain/sim-http-api-domain-name.js";
import { SimApiGatewayV2BadRequest } from "../error/sim-api-gateway-v2.error.js";

/**
 * Simulated API Gateway cross-Account registry of custom domain names.
 *
 * A domain name is unique across the whole of real AWS rather than within one
 * Account, so this is where that uniqueness is enforced, in the same way API
 * ids are allocated against the API registry.
 *
 * It is also how a served request finds the domain it arrived at. A request to
 * a custom domain carries a hostname and nothing else: no API id, no Account,
 * and nothing saying it is an API Gateway hostname at all. That makes this the
 * answer to which simulated service a hostname belongs to, which is what
 * `SimAwsServiceHosts` asks.
 *
 * Simulated DNS asks a hosted-zone record about a custom domain name first,
 * the way the custom domain name reaches the domain through a record on AWS.
 * This answers where no record names the hostname. That is how a test that
 * creates only a domain reaches it.
 */
export class SimHttpApiDomainRegistry implements SimAwsServiceHosts {
  private readonly domainsByHost = new Map<string, SimHttpApiDomainName>();
  private readonly claims: SimAwsHostnameClaims;

  constructor(claims: SimAwsHostnameClaims = new SimAwsHostnameClaims()) {
    this.claims = claims;
  }

  /**
   * Register a newly created domain, so requests to it resolve.
   */
  register(domain: SimHttpApiDomainName): void {
    this.requireUnused(domain);

    for (const hostname of domain.hostnames) {
      this.domainsByHost.set(hostname.toLowerCase(), domain);
    }

    // Only the custom domain name is claimed. The regional endpoint is a name
    // API Gateway made up, and takes no hostname away from another service.
    this.claims.claim(domain.hostname);
  }

  /**
   * Forget a deleted domain, so its hostname stops resolving.
   */
  deregister(domain: SimHttpApiDomainName): void {
    for (const hostname of domain.hostnames) {
      this.domainsByHost.delete(hostname.toLowerCase());
    }

    this.claims.release(domain.hostname);
  }

  /**
   * Find the domain a request's hostname reaches, by either of the two names
   * the domain answers on.
   */
  findByHost(hostname: string): SimHttpApiDomainName | undefined {
    return this.domainsByHost.get(hostname.toLowerCase());
  }

  /**
   * The simulated service target a hostname names, if a domain answers on it.
   *
   * The Region comes from the domain's own scope rather than from the
   * hostname, because a custom domain's hostname says nothing about where it
   * was created.
   */
  targetForHost(hostname: string): SimAwsServiceTarget | undefined {
    const domain = this.findByHost(hostname);

    if (domain === undefined) {
      return undefined;
    }

    return {
      service: "apiGatewayDomain",
      resourceName: domain.domainName,
      regionName: domain.accountRegionScope.regionName,
    };
  }

  private requireUnused(domain: SimHttpApiDomainName): void {
    if (!this.claims.isClaimed(domain.hostname)) {
      return;
    }

    throw new SimApiGatewayV2BadRequest(
      `The domain name ${domain.domainName} already exists: a custom domain ` +
        `name is unique across every simulated Account and Region and across ` +
        `every simulated service, as it is across the whole of real AWS`,
    );
  }
}
