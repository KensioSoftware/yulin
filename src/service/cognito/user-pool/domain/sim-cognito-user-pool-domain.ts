import { faker } from "@faker-js/faker";
import type { SimCognitoUserPoolId } from "../sim-cognito-user-pool-id.js";
import type { SimCognitoCustomDomainConfig } from "./sim-cognito-custom-domain-config.js";
import type { SimCognitoDomainName } from "./sim-cognito-domain-name.js";

/**
 * How many characters a simulated CloudFront distribution name carries.
 */
const distributionNameLength = 13;

interface SimCognitoUserPoolDomainProperties {
  readonly name: SimCognitoDomainName;
  readonly userPoolId: SimCognitoUserPoolId;
  readonly customDomainConfig?: SimCognitoCustomDomainConfig | undefined;

  /**
   * Which managed login branding the domain was created with: `1` for the
   * classic hosted UI and `2` for managed login. Neither set of pages is
   * simulated, so the version is recorded and reported rather than changing
   * anything.
   */
  readonly managedLoginVersion?: number | undefined;
}

/**
 * One simulated user pool domain.
 *
 * A pool has at most one domain, and the domain is where the OAuth endpoints
 * are served: without one, a pool has an API and nothing a browser can reach.
 *
 * Real Cognito puts a CloudFront distribution in front of a custom domain and
 * expects the domain's own DNS to point at it. This simulation answers on the
 * custom hostname directly, so the distribution it reports is a name nothing
 * here serves, and a test needs no DNS record of its own.
 */
export class SimCognitoUserPoolDomain {
  public readonly name: SimCognitoDomainName;
  public readonly userPoolId: SimCognitoUserPoolId;
  public readonly customDomainConfig: SimCognitoCustomDomainConfig | undefined;
  public readonly managedLoginVersion: number | undefined;

  /**
   * The CloudFront distribution real Cognito would put in front of a custom
   * domain, which a prefix domain does not get.
   */
  public readonly cloudFrontDistribution: string | undefined;

  constructor(properties: SimCognitoUserPoolDomainProperties) {
    this.name = properties.name;
    this.userPoolId = properties.userPoolId;
    this.customDomainConfig = properties.customDomainConfig;
    this.managedLoginVersion = properties.managedLoginVersion;
    this.cloudFrontDistribution = SimCognitoUserPoolDomain.distributionFor(
      this.name.custom,
    );
  }

  /**
   * The distribution name a domain reports, which only a custom domain has.
   */
  private static distributionFor(custom: boolean): string | undefined {
    if (!custom) {
      return undefined;
    }

    const name = faker.string.alphanumeric({
      length: distributionNameLength,
      casing: "lower",
    });

    return `${name}.cloudfront.net`;
  }

  /** The domain string this domain was created with. */
  get value(): string {
    return this.name.value;
  }

  /** The hostname real Cognito would serve this domain on. */
  get hostname(): string {
    return this.name.hostname;
  }

  /** The hostname this domain answers on inside the simulation. */
  get localHostname(): string {
    return this.name.localHostname;
  }

  /**
   * The hostnames a request can reach this domain by.
   *
   * A prefix domain answers on both the real AWS hostname and the local one it
   * is rewritten to, so a request that names either finds it. They are the
   * same hostname for a custom domain, which has no AWS domain to drop.
   */
  get hostnames(): readonly string[] {
    return [...new Set([this.hostname, this.localHostname])];
  }
}
