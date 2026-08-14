import {
  SimCognitoSharedTokenClaims,
  type SimCognitoTokenClaims,
  type SimCognitoTokenClaimsProperties,
} from "./sim-cognito-token-claims.js";

/**
 * The scope an access token from an authentication flow in the API carries.
 *
 * Real Cognito issues this scope for sign-in through the user pool API, which
 * asks for no scopes of its own. A sign-in through the hosted endpoints asks
 * for scopes, and those are what its access token carries instead.
 */
const userPoolAdminScope = "aws.cognito.signin.user.admin";

/**
 * The claims of a simulated access token.
 *
 * An access token says what the caller may do, so it names the app client in
 * `client_id`, carries a `scope`, and has no `aud`. Its `username` is the
 * user's username, where an id token calls the same thing `cognito:username`.
 */
export class SimCognitoAccessToken {
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
      client_id: client.id,
      token_use: "access",
      scope: this.scope(),
      username: user.username,
    };
  }

  /**
   * The `scope` claim, which is a space separated list however many scopes
   * the sign-in was granted.
   */
  private scope(): string {
    const { scopes } = this.properties;

    if (scopes === undefined) {
      return userPoolAdminScope;
    }

    return scopes.join(" ");
  }
}
