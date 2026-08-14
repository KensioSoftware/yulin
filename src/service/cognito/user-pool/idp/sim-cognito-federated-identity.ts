/**
 * One entry of a user's `identities`, in the shape an id token carries it.
 *
 * `issuer` is null for the social providers, which have one issuer each, and
 * names the issuer for a SAML or OIDC provider. `primary` says which identity
 * a linked user signs in as, and is always true here because a user linked to
 * more than one provider is what `AdminLinkProviderForUser` does, and that is
 * not simulated.
 */
export interface SimCognitoIdentityClaim {
  readonly userId: string;
  readonly providerName: string;
  readonly providerType: string;
  readonly issuer: string | null;

  /**
   * Whether this is the identity the user signs in as, which Cognito writes as
   * the string `"true"` rather than as a boolean, in the token as well as in
   * the attribute.
   */
  readonly primary: string;

  /** When the identity was linked, in milliseconds, written as a string. */
  readonly dateCreated: string;
}

interface SimCognitoFederatedIdentityProperties {
  readonly userId: string;
  readonly providerName: string;
  readonly providerType: string;
  readonly issuer: string | undefined;
  readonly createdAt: Date;
}

/**
 * Where a federated user came from.
 *
 * Cognito records this on the user it creates for an external subject, and
 * reports it in two places: as an `identities` attribute holding JSON, and as
 * an `identities` claim in the id token holding the same thing as an array. A
 * request cannot set it, so it lives on the user rather than among its
 * attributes, in the same way `sub` does.
 */
export class SimCognitoFederatedIdentity {
  public readonly userId: string;
  public readonly providerName: string;
  public readonly providerType: string;
  public readonly issuer: string | null;
  public readonly dateCreated: number;

  constructor(properties: SimCognitoFederatedIdentityProperties) {
    this.userId = properties.userId;
    this.providerName = properties.providerName;
    this.providerType = properties.providerType;
    this.issuer = properties.issuer ?? null;
    this.dateCreated = properties.createdAt.getTime();
  }

  /**
   * This identity as a token claim carries it.
   *
   * `primary` and `dateCreated` are strings, which is how the AWS
   * documentation's own id token example writes them.
   */
  toClaim(): SimCognitoIdentityClaim {
    return {
      userId: this.userId,
      providerName: this.providerName,
      providerType: this.providerType,
      issuer: this.issuer,
      primary: "true",
      dateCreated: String(this.dateCreated),
    };
  }

  /**
   * This identity as the user's `identities` attribute holds it.
   *
   * The attribute is a JSON string, which is what a described user reports and
   * what code reading `identities` from `AdminGetUser` has to parse. What it
   * holds is what the token claim holds.
   */
  toAttributeValue(): string {
    return JSON.stringify([this.toClaim()]);
  }
}
