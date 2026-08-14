import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { SimCognitoOAuthError } from "../../error/sim-cognito-oauth.error.js";
import type { SimCognitoUserPool } from "../../user-pool/sim-cognito-user-pool.js";
import type { SimCognitoTokenIssuer } from "../../user-pool/token/sim-cognito-token-issuer.js";
import { SimCognitoHostedClient } from "./sim-cognito-hosted-client.js";
import { SimCognitoTokenGrants } from "./sim-cognito-token-grants.js";
import type {
  SimCognitoTokenInput,
  SimCognitoTokenOutput,
} from "./hosted-auth.command.js";

/**
 * The grants this endpoint answers.
 */
const authorizationCodeGrant = "authorization_code";
const refreshTokenGrant = "refresh_token";
const clientCredentialsGrant = "client_credentials";

interface SimCognitoTokenEndpointProperties {
  readonly tokenIssuer: SimCognitoTokenIssuer;
  readonly clock: SimClock;
}

/**
 * The `/oauth2/token` endpoint of a pool's hosted domain.
 *
 * This is the half of an authorization code grant that happens on the
 * application's own server: the browser carried the code back, and the
 * application exchanges it here for the tokens, authenticating as the app
 * client while it does.
 *
 * The tokens come from the pool's own token issuer rather than from anything
 * here, so a token from a hosted sign-in is the same token an API sign-in
 * issues, runs the same `PreTokenGeneration` trigger, and is remembered by the
 * pool the same way.
 */
export class SimCognitoTokenEndpoint {
  private readonly hostedClient = new SimCognitoHostedClient();
  private readonly grants: SimCognitoTokenGrants;

  constructor(properties: SimCognitoTokenEndpointProperties) {
    this.grants = new SimCognitoTokenGrants(properties);
  }

  /**
   * Exchange an authorization code or a refresh token for tokens.
   */
  async handle(
    pool: SimCognitoUserPool,
    input: SimCognitoTokenInput,
  ): Promise<SimCognitoTokenOutput> {
    const client = this.hostedClient.forToken(
      pool,
      input.client_id,
      input.client_secret,
    );

    this.hostedClient.requireCodeGrant(client, false);

    if (input.grant_type === authorizationCodeGrant) {
      return await this.grants.exchangeCode(pool, client, input);
    }

    if (input.grant_type === refreshTokenGrant) {
      return await this.grants.refresh(pool, client, input);
    }

    throw new SimCognitoOAuthError({
      code: "unsupported_grant_type",
      description: this.unsupportedGrantDescription(input.grant_type),
      redirectable: false,
    });
  }

  private unsupportedGrantDescription(grantType: string | undefined): string {
    if (grantType === clientCredentialsGrant) {
      return (
        "grant_type 'client_credentials' is not simulated: it issues a " +
        "token for the custom scopes of a resource server, and resource " +
        "servers are not simulated"
      );
    }

    return (
      `grant_type '${String(grantType)}' is not a grant this endpoint ` +
      `answers: it answers '${authorizationCodeGrant}' and ` +
      `'${refreshTokenGrant}'`
    );
  }
}
