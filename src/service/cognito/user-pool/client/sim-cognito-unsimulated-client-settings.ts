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
    this.settings = this.accepted(settings);
  }

  /**
   * These settings as a described app client reports them.
   */
  toOutput(): SimCognitoUnsimulatedClientSettingsType {
    return structuredClone(this.settings);
  }

  /**
   * The settings this holds, copied out of the request rather than kept by
   * reference.
   *
   * A caller passes its whole `CreateUserPoolClient` input in, and may reuse
   * or edit that object afterwards. Copying means a described client reports
   * what the request said at the time it was made, as a real one does.
   *
   * Each setting is kept only where the request set it, so a client created
   * without either reports neither rather than reporting the value it would
   * have had to use.
   */
  private accepted(
    settings: SimCognitoUnsimulatedClientSettingsType,
  ): SimCognitoUnsimulatedClientSettingsType {
    return structuredClone({
      ...(settings.AllowedOAuthFlowsUserPoolClient !== undefined && {
        AllowedOAuthFlowsUserPoolClient:
          settings.AllowedOAuthFlowsUserPoolClient,
      }),
      ...(settings.SupportedIdentityProviders !== undefined && {
        SupportedIdentityProviders: settings.SupportedIdentityProviders,
      }),
    });
  }
}
