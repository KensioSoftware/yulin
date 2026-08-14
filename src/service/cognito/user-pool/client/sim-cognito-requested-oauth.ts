import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoOAuthSettingsType } from "./sim-cognito-oauth-settings.js";
import {
  simCognitoRequiredOAuthFlows,
  simCognitoRequiredOAuthScopes,
} from "./sim-cognito-oauth-grants.js";
import { SimCognitoRedirectUrls } from "./sim-cognito-redirect-urls.js";

/**
 * The OAuth settings a request asked an app client for, checked.
 *
 * Everything an app client's OAuth settings can be refused for is here, so
 * that what the client then holds is a set of values nothing has left to say
 * no to.
 */
export class SimCognitoRequestedOAuth {
  public readonly enabled: boolean;
  public readonly flows: readonly string[];
  public readonly scopes: readonly string[];
  public readonly callbackUrls: SimCognitoRedirectUrls;
  public readonly logoutUrls: SimCognitoRedirectUrls;
  public readonly defaultRedirectUri: string | undefined;
  public readonly identityProviders: readonly string[];

  constructor(settings: SimCognitoOAuthSettingsType) {
    this.enabled = settings.AllowedOAuthFlowsUserPoolClient ?? false;
    this.requireEnabledFor(settings);

    this.flows = simCognitoRequiredOAuthFlows(settings.AllowedOAuthFlows);
    this.scopes = simCognitoRequiredOAuthScopes(settings.AllowedOAuthScopes);
    this.callbackUrls = new SimCognitoRedirectUrls(
      "CallbackURLs",
      settings.CallbackURLs,
    );
    this.logoutUrls = new SimCognitoRedirectUrls(
      "LogoutURLs",
      settings.LogoutURLs,
    );
    this.defaultRedirectUri = this.requiredDefaultRedirect(
      settings.DefaultRedirectURI,
    );
    this.identityProviders = [...(settings.SupportedIdentityProviders ?? [])];
  }

  /**
   * Refuse the settings that need the authorization server turned on first.
   *
   * Real Cognito requires `AllowedOAuthFlowsUserPoolClient` to be true before
   * any of these can be set, so a client carrying them with it left false is
   * refused here as it is there.
   */
  private requireEnabledFor(settings: SimCognitoOAuthSettingsType): void {
    if (this.enabled) {
      return;
    }

    const gated = [
      ["AllowedOAuthFlows", settings.AllowedOAuthFlows],
      ["AllowedOAuthScopes", settings.AllowedOAuthScopes],
      ["CallbackURLs", settings.CallbackURLs],
      ["LogoutURLs", settings.LogoutURLs],
    ] as const;

    for (const [option, value] of gated) {
      if (value !== undefined) {
        throw new SimCognitoInvalidParameterException(
          `${option} needs AllowedOAuthFlowsUserPoolClient to be true: the ` +
            `app client has no authorization server to configure until it is`,
        );
      }
    }
  }

  private requiredDefaultRedirect(
    requested: string | undefined,
  ): string | undefined {
    if (requested === undefined) {
      return undefined;
    }

    if (!this.callbackUrls.includes(requested)) {
      throw new SimCognitoInvalidParameterException(
        `DefaultRedirectURI '${requested}' is not one of the app client's ` +
          `CallbackURLs`,
      );
    }

    return requested;
  }
}
