import type { SimClock } from "../../../../util/clock/sim-clock.js";
import { requireSimCognitoRefreshTokenInput } from "../../user-pool/auth/sim-cognito-refresh-token-input.js";
import { requireSimCognitoClientSecret } from "../../user-pool/client/sim-cognito-client-secret.js";
import { SimCognitoUnsimulatedInput } from "../sim-cognito-unsimulated-input.js";
import type { SimCognitoAuthResolver } from "./sim-cognito-auth-resolver.js";
import type { SimCognitoRefreshedTokens } from "./sim-cognito-refreshed-tokens.js";
import type {
  SimGetTokensFromRefreshTokenCommand,
  SimGetTokensFromRefreshTokenCommandOutput,
} from "./auth.command.js";

interface SimCognitoGetTokensFromRefreshTokenProperties {
  readonly authResolver: SimCognitoAuthResolver;
  readonly refreshedTokens: SimCognitoRefreshedTokens;
  readonly clock: SimClock;
}

/**
 * The GetTokensFromRefreshToken command.
 *
 * This is what renews a session on an app client that rotates its refresh
 * tokens, and it renews one on a client that does not just as well. Like
 * `InitiateAuth` it is what a browser or mobile app calls, so no IAM
 * permission is involved and no caller is read.
 *
 * The request names no user and carries no `SECRET_HASH`. The refresh token is
 * what says whose session this is, and the client secret is what proves the
 * caller, which is why a confidential client sends `ClientSecret` here rather
 * than a hash computed over a username it does not have.
 */
export class SimCognitoGetTokensFromRefreshToken {
  private readonly authResolver: SimCognitoAuthResolver;
  private readonly refreshedTokens: SimCognitoRefreshedTokens;
  private readonly clock: SimClock;
  private readonly unsimulated = new SimCognitoUnsimulatedInput(
    "GetTokensFromRefreshToken",
  );

  constructor(properties: SimCognitoGetTokensFromRefreshTokenProperties) {
    this.authResolver = properties.authResolver;
    this.refreshedTokens = properties.refreshedTokens;
    this.clock = properties.clock;
  }

  /**
   * Renew a session from the refresh token it holds.
   */
  async handle(
    command: SimGetTokensFromRefreshTokenCommand,
  ): Promise<SimGetTokensFromRefreshTokenCommandOutput> {
    const { input } = command;
    const { pool, client } = this.authResolver.client(input.ClientId);

    this.unsimulated.refuse(
      "DeviceKey",
      input.DeviceKey,
      "device remembering, which signs a known device in without its second factor",
    );
    requireSimCognitoClientSecret(client, input.ClientSecret);

    const refreshToken = pool.auth.requireRefreshToken({
      value: requireSimCognitoRefreshTokenInput(input.RefreshToken),
      clientId: client.id,
      now: this.clock.now(),
    });

    return {
      $metadata: {},
      AuthenticationResult: await this.refreshedTokens.issue({
        pool,
        client,
        refreshToken,
        clientMetadata: input.ClientMetadata,
      }),
    };
  }
}
