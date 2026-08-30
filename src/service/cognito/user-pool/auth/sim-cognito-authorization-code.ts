import { createHash, randomUUID } from "node:crypto";

/**
 * How long an authorization code lasts.
 *
 * Real Cognito gives one five minutes, and nothing configures that.
 */
const codeMinutes = 5;

/**
 * The only PKCE method real Cognito supports.
 */
export const simCognitoCodeChallengeMethod = "S256";

interface SimCognitoAuthorizationCodeProperties {
  readonly username: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly issuedAt: Date;

  /**
   * The PKCE challenge the authorize request carried, which the token request
   * has to produce the verifier for.
   */
  readonly codeChallenge?: string | undefined;

  /**
   * Whether the sign-in this code came from happened at an identity provider.
   *
   * The token endpoint reads it to pick the `PreTokenGeneration` source, which
   * real Cognito reports as `TokenGeneration_HostedAuth` for a federated grant
   * and `TokenGeneration_Authentication` for a local one.
   */
  readonly federated?: boolean | undefined;
}

/**
 * One authorization code, which is what an authorization code grant carries
 * from the browser to the application's own server.
 *
 * The code is opaque, single use and tied to the app client and redirect URI
 * it was issued for. Everything the token endpoint needs to answer with tokens
 * is here, because the code is all that request carries.
 */
export class SimCognitoAuthorizationCode {
  public readonly value: string;
  public readonly username: string;
  public readonly clientId: string;
  public readonly redirectUri: string;
  public readonly scopes: readonly string[];
  public readonly issuedAt: Date;
  public readonly federated: boolean;

  private readonly codeChallenge: string | undefined;

  constructor(properties: SimCognitoAuthorizationCodeProperties) {
    this.value = randomUUID();
    this.username = properties.username;
    this.clientId = properties.clientId;
    this.redirectUri = properties.redirectUri;
    this.scopes = properties.scopes;
    this.issuedAt = properties.issuedAt;
    this.federated = properties.federated ?? false;
    this.codeChallenge = properties.codeChallenge;
  }

  /**
   * Whether this code has run out by a given moment.
   */
  isExpiredAt(now: Date): boolean {
    const expiresAt = new Date(this.issuedAt.getTime() + codeMinutes * 60_000);

    return now.getTime() >= expiresAt.getTime();
  }

  /**
   * Whether a token request presents the verifier this code was issued for.
   *
   * A code issued without a challenge needs no verifier, and one issued with a
   * challenge is only redeemed by the verifier it was derived from. Real
   * Cognito supports the `S256` method alone, so the verifier is hashed rather
   * than compared as it stands.
   */
  matchesVerifier(codeVerifier: string | undefined): boolean {
    if (this.codeChallenge === undefined) {
      return true;
    }

    if (codeVerifier === undefined) {
      return false;
    }

    return (
      createHash("sha256").update(codeVerifier).digest("base64url") ===
      this.codeChallenge
    );
  }

  /**
   * Whether the token request names the redirect URI this code was issued for.
   */
  isForRedirect(redirectUri: string | undefined): boolean {
    return this.redirectUri === redirectUri;
  }

  /**
   * Whether this code was issued to an app client.
   */
  isFor(clientId: string): boolean {
    return this.clientId === clientId;
  }
}
