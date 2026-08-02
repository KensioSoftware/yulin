/**
 * Minimal structural view of a JWT authorizer's configuration, as the Create
 * and Get commands carry it.
 */
export interface SimHttpApiJwtConfigurationView {
  Issuer: string;
  Audience: string[];
}

interface SimHttpApiJwtConfigurationProperties {
  readonly issuer: string;
  readonly audience: readonly string[];
}

/**
 * Which issuer a JWT authorizer trusts, and which audiences it accepts.
 *
 * The issuer is compared to the token's `iss` exactly. Real API Gateway
 * compares them as strings too, which is why a configured issuer with a
 * trailing slash rejects tokens from the same issuer without one.
 */
export class SimHttpApiJwtConfiguration {
  public readonly issuer: string;
  public readonly audience: readonly string[];

  constructor(properties: SimHttpApiJwtConfigurationProperties) {
    this.issuer = properties.issuer;
    this.audience = properties.audience;
  }

  /**
   * Whether a token's `iss` names the issuer this authorizer trusts.
   */
  trustsIssuer(issuer: string | undefined): boolean {
    return issuer === this.issuer;
  }

  /**
   * Whether any audience the token claims is one this authorizer accepts.
   */
  acceptsAudience(claimed: readonly string[]): boolean {
    return claimed.some((audience) => this.audience.includes(audience));
  }

  /**
   * The AWS-like view of this configuration.
   */
  view(): SimHttpApiJwtConfigurationView {
    return { Issuer: this.issuer, Audience: [...this.audience] };
  }
}
