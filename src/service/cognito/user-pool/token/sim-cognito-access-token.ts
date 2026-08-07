import {
  SimCognitoSharedTokenClaims,
  type SimCognitoTokenClaims,
  type SimCognitoTokenClaimsProperties,
} from "./sim-cognito-token-claims.js";

/**
 * The scope an access token from an admin authentication flow carries.
 *
 * Real Cognito issues this scope for sign-in through the user pool API. The
 * scopes a resource server defines reach a token through the hosted UI and
 * client credentials flows, neither of which is simulated.
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
      scope: userPoolAdminScope,
      username: user.username,
    };
  }
}
