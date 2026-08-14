import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCreateUserPoolDomainCommandInput } from "../../command/domain/user-pool-domain.command.js";
import type { SimCognitoUserPool } from "../sim-cognito-user-pool.js";
import { simCognitoUserPoolRegionName } from "../sim-cognito-user-pool-id.js";
import {
  SimCognitoCustomDomainConfig,
  type SimCognitoCustomDomainConfigType,
} from "./sim-cognito-custom-domain-config.js";
import { SimCognitoDomainName } from "./sim-cognito-domain-name.js";
import { SimCognitoUserPoolDomain } from "./sim-cognito-user-pool-domain.js";

/**
 * The one domain a pool can have: building the one a request asked for, and
 * resolving the one the pool holds.
 *
 * A `CustomDomainConfig` is what says the request wants a custom domain rather
 * than a Cognito prefix, so it decides both how the domain string is checked
 * and whether a certificate is required.
 */
export class SimCognitoPoolDomains {
  /**
   * Refuse a second domain on a pool that has one.
   *
   * Real Cognito allows one domain per pool, prefix or custom, so a request
   * adding another is refused rather than quietly replacing what is there.
   */
  private static requireNoDomain(pool: SimCognitoUserPool): void {
    const existing = pool.auth.domain;

    if (existing !== undefined) {
      throw new SimCognitoInvalidParameterException(
        `User pool ${pool.id} already has the domain '${existing.value}': a ` +
          `pool has one domain, so delete that one before adding another`,
      );
    }
  }

  private static customDomainConfig(
    config: SimCognitoCustomDomainConfigType | undefined,
  ): SimCognitoCustomDomainConfig | undefined {
    if (config === undefined) {
      return undefined;
    }

    return new SimCognitoCustomDomainConfig(config);
  }

  /**
   * Make a pool's domain, refusing a pool that already has one.
   */
  make(
    pool: SimCognitoUserPool,
    input: SimCreateUserPoolDomainCommandInput,
  ): SimCognitoUserPoolDomain {
    SimCognitoPoolDomains.requireNoDomain(pool);

    return new SimCognitoUserPoolDomain({
      name: new SimCognitoDomainName({
        value: input.Domain,
        custom: input.CustomDomainConfig !== undefined,
        // A prefix domain is served under the pool's own region, which the
        // pool id names, so no separate region is needed here.
        regionName: simCognitoUserPoolRegionName(pool.id),
      }),
      userPoolId: pool.id,
      customDomainConfig: SimCognitoPoolDomains.customDomainConfig(
        input.CustomDomainConfig,
      ),
      managedLoginVersion: input.ManagedLoginVersion,
    });
  }

  /**
   * The domain a delete request named, or a refusal.
   *
   * Real Cognito answers a request naming a domain the pool does not hold the
   * same way it answers one naming no pool at all, and says no more than that.
   */
  require(
    pool: SimCognitoUserPool,
    domainValue: string | undefined,
  ): SimCognitoUserPoolDomain {
    const domain = pool.auth.domain;

    if (domain === undefined || domain.value !== domainValue) {
      throw new SimCognitoInvalidParameterException(
        "No such domain or user pool exists.",
      );
    }

    return domain;
  }
}
