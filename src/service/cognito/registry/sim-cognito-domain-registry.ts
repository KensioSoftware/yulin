import type { SimAwsServiceHosts } from "../../../serve/controller/host/sim-aws-service-hosts.js";
import type { SimAwsServiceTarget } from "../../../serve/controller/sim-service-controller.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import type { SimCognitoUserPoolDomain } from "../user-pool/domain/sim-cognito-user-pool-domain.js";
import { simCognitoUserPoolRegionName } from "../user-pool/sim-cognito-user-pool-id.js";

/**
 * Simulated Cognito cross-Account registry of user pool domains.
 *
 * A domain is unique across the whole of real AWS rather than within one
 * account, so this is where that uniqueness is enforced, in the same way pool
 * ids are allocated against the pool registry.
 *
 * It is also how a served request finds the pool it is for. A request to a
 * hosted domain carries a hostname and nothing else: no pool id, no account,
 * and for a custom domain nothing that says it is a Cognito hostname at all.
 * That makes this the answer to which simulated service a hostname belongs to,
 * which is what `SimAwsServiceHosts` asks.
 */
export class SimCognitoDomainRegistry implements SimAwsServiceHosts {
  private readonly domainsByName = new Map<string, SimCognitoUserPoolDomain>();
  private readonly domainsByHost = new Map<string, SimCognitoUserPoolDomain>();

  /**
   * Register a newly created domain, so requests to it resolve.
   *
   * A domain string already in use is refused the way real Cognito refuses
   * one, and so is a hostname already answered on, which is the same thing
   * said in terms of the request that would arrive.
   */
  register(domain: SimCognitoUserPoolDomain): void {
    this.requireUnused(domain);

    this.domainsByName.set(domain.value, domain);

    for (const hostname of domain.hostnames) {
      this.domainsByHost.set(hostname.toLowerCase(), domain);
    }
  }

  /**
   * Forget a deleted domain, so requests to it stop resolving.
   */
  deregister(domain: SimCognitoUserPoolDomain): void {
    this.domainsByName.delete(domain.value);

    for (const hostname of domain.hostnames) {
      this.domainsByHost.delete(hostname.toLowerCase());
    }
  }

  /**
   * Find a domain by the domain string it was created with.
   */
  find(domainValue: string | undefined): SimCognitoUserPoolDomain | undefined {
    if (domainValue === undefined) {
      return undefined;
    }

    return this.domainsByName.get(domainValue);
  }

  /**
   * Find the domain a request's hostname reaches.
   */
  findByHost(hostname: string): SimCognitoUserPoolDomain | undefined {
    return this.domainsByHost.get(hostname.toLowerCase());
  }

  /**
   * The simulated service target a hostname names, if a domain answers on it.
   *
   * The region comes from the pool's id rather than from the hostname, because
   * a custom domain's hostname says nothing about where its pool lives.
   */
  targetForHost(hostname: string): SimAwsServiceTarget | undefined {
    const domain = this.findByHost(hostname);

    if (domain === undefined) {
      return undefined;
    }

    return {
      service: "cognitoIdentityProvider",
      resourceName: domain.value,
      regionName: simCognitoUserPoolRegionName(
        domain.userPoolId,
      ) as AwsRegionName,
    };
  }

  private requireUnused(domain: SimCognitoUserPoolDomain): void {
    const taken = domain.hostnames.some((hostname) =>
      this.domainsByHost.has(hostname.toLowerCase()),
    );

    if (taken || this.domainsByName.has(domain.value)) {
      throw new SimCognitoInvalidParameterException(
        `Domain '${domain.value}' is already in use: a user pool domain is ` +
          `unique across every simulated Account and Region, as it is across ` +
          `the whole of real AWS`,
      );
    }
  }
}
