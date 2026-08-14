import {
  SimCognitoSharedTokenClaims,
  type SimCognitoTokenClaims,
  type SimCognitoTokenClaimsProperties,
} from "./sim-cognito-token-claims.js";

/**
 * The claims of a simulated id token.
 *
 * An id token says who the user is, so it carries the user's attributes and
 * names the app client it was issued to in `aud`. An access token names the
 * same client in `client_id` and has no `aud` at all, which is the difference
 * verification libraries check and the one code most often gets wrong.
 */
export class SimCognitoIdToken {
  private readonly properties: SimCognitoTokenClaimsProperties;
  private readonly shared: SimCognitoSharedTokenClaims;

  constructor(properties: SimCognitoTokenClaimsProperties) {
    this.properties = properties;
    this.shared = new SimCognitoSharedTokenClaims(properties);
  }

  /**
   * The claims this token is signed with.
   */
  claims(): SimCognitoTokenClaims {
    const { client, user } = this.properties;

    return {
      ...this.shared.build(),
      ...this.attributeClaims(),
      ...this.identityClaims(),
      aud: client.id,
      token_use: "id",
      "cognito:username": user.username,
    };
  }

  /**
   * Where a federated user came from, which real Cognito reports in the id
   * token as an array rather than as the JSON string the user attribute holds.
   *
   * A user of the pool's own has no such claim at all.
   */
  private identityClaims(): SimCognitoTokenClaims {
    const identity = this.properties.user.identity;

    if (identity === undefined) {
      return {};
    }

    return { identities: [identity.toClaim()] };
  }

  /**
   * The user's attributes, as an id token carries them.
   *
   * Each is reported under its own name, as real Cognito reports them. `sub`
   * is not among them, because the shared claims already hold it.
   */
  private attributeClaims(): SimCognitoTokenClaims {
    return Object.fromEntries(this.properties.user.attributeValues);
  }
}
