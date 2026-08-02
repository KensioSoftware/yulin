/**
 * The app client settings a request may set that this simulation does not act
 * on.
 *
 * These are the two managed login settings `CreateUserPoolClient` accepts at
 * one value each, in the shape a described client reports them in.
 */
export interface SimCognitoUnsimulatedClientSettingsType {
  readonly AllowedOAuthFlowsUserPoolClient?: boolean | undefined;
  readonly SupportedIdentityProviders?: readonly string[] | undefined;
}

/**
 * The settings an app client was created with and this simulation does not
 * act on.
 *
 * Both say the client wants nothing outside the pool's own users: no hosted
 * UI OAuth flows, and no federated identity provider. Neither reaches
 * anything here, because there is nothing here to turn off, so they are kept
 * only so `DescribeUserPoolClient` reports what the request set.
 */
export class SimCognitoUnsimulatedClientSettings {
  private readonly settings: SimCognitoUnsimulatedClientSettingsType;

  constructor(settings: SimCognitoUnsimulatedClientSettingsType) {
    this.settings = settings;
  }

  /**
   * These settings as a described app client reports them.
   *
   * Each one appears only where the request set it, so a described client
   * carries what was asked for and nothing more.
   */
  toOutput(): SimCognitoUnsimulatedClientSettingsType {
    const settings = this.settings;

    return {
      ...(settings.AllowedOAuthFlowsUserPoolClient !== undefined && {
        AllowedOAuthFlowsUserPoolClient:
          settings.AllowedOAuthFlowsUserPoolClient,
      }),
      ...(settings.SupportedIdentityProviders !== undefined && {
        SupportedIdentityProviders: settings.SupportedIdentityProviders,
      }),
    };
  }
}
