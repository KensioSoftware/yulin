import type { SimCognitoRedirectUrls } from "./sim-cognito-redirect-urls.js";
import { simCognitoSimulatedOAuthFlow } from "./sim-cognito-oauth-grants.js";
import { SimCognitoRequestedOAuth } from "./sim-cognito-requested-oauth.js";

/**
 * The OAuth properties of an app client, in the shape a request sets them and
 * a described client reports them.
 */
export interface SimCognitoOAuthSettingsType {
  readonly AllowedOAuthFlows?: readonly string[] | undefined;
  readonly AllowedOAuthFlowsUserPoolClient?: boolean | undefined;
  readonly AllowedOAuthScopes?: readonly string[] | undefined;
  readonly CallbackURLs?: readonly string[] | undefined;
  readonly LogoutURLs?: readonly string[] | undefined;
  readonly DefaultRedirectURI?: string | undefined;
  readonly SupportedIdentityProviders?: readonly string[] | undefined;
}

/**
 * What an app client is allowed to do at a pool's hosted domain.
 *
 * These settings are what the authorize, token and logout endpoints check a
 * request against: which grant it may ask for, which scopes it may be given,
 * which URL it may be sent back to, and which identity provider it may sign a
 * user in through. Nothing here is honoured without a domain, because there is
 * no endpoint to reach until the pool has one.
 *
 * `AllowedOAuthFlowsUserPoolClient` gates the rest, as it does on real
 * Cognito: the other settings cannot be configured until it is true.
 */
export class SimCognitoOAuthSettings {
  public readonly enabled: boolean;
  public readonly flows: readonly string[];
  public readonly scopes: readonly string[];
  public readonly callbackUrls: SimCognitoRedirectUrls;
  public readonly logoutUrls: SimCognitoRedirectUrls;
  public readonly defaultRedirectUri: string | undefined;
  public readonly identityProviders: readonly string[];

  constructor(settings: SimCognitoOAuthSettingsType) {
    const requested = new SimCognitoRequestedOAuth(settings);

    this.enabled = requested.enabled;
    this.flows = requested.flows;
    this.scopes = requested.scopes;
    this.callbackUrls = requested.callbackUrls;
    this.logoutUrls = requested.logoutUrls;
    this.defaultRedirectUri = requested.defaultRedirectUri;
    this.identityProviders = requested.identityProviders;
  }

  /**
   * These settings as a described app client reports them.
   *
   * A list the request did not set is left out rather than reported empty, so
   * a client created without any of this reports none of it.
   */
  toOutput(): SimCognitoOAuthSettingsType {
    return {
      AllowedOAuthFlowsUserPoolClient: this.enabled,
      ...(this.flows.length > 0 && { AllowedOAuthFlows: [...this.flows] }),
      ...(this.scopes.length > 0 && { AllowedOAuthScopes: [...this.scopes] }),
      ...(this.callbackUrls.values.length > 0 && {
        CallbackURLs: [...this.callbackUrls.values],
      }),
      ...(this.logoutUrls.values.length > 0 && {
        LogoutURLs: [...this.logoutUrls.values],
      }),
      ...(this.defaultRedirectUri !== undefined && {
        DefaultRedirectURI: this.defaultRedirectUri,
      }),
      ...(this.identityProviders.length > 0 && {
        SupportedIdentityProviders: [...this.identityProviders],
      }),
    };
  }

  /**
   * Whether this client may complete an authorization code grant.
   */
  get allowsCodeGrant(): boolean {
    return this.enabled && this.flows.includes(simCognitoSimulatedOAuthFlow);
  }

  /**
   * Whether a redirect URI is one this client registered.
   */
  allowsRedirectTo(redirectUri: string): boolean {
    return this.callbackUrls.includes(redirectUri);
  }

  /**
   * Whether a sign-out URL is one this client registered.
   */
  allowsSignOutTo(logoutUri: string): boolean {
    return this.logoutUrls.includes(logoutUri);
  }

  /**
   * Whether this client offers an identity provider by name.
   */
  allowsIdentityProvider(providerName: string): boolean {
    return this.identityProviders.includes(providerName);
  }
}
