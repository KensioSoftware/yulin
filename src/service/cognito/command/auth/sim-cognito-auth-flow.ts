import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolClient } from "../../user-pool/client/sim-cognito-user-pool-client.js";

interface SimCognitoAuthFlowProperties {
  readonly name: string;
  readonly clientSetting: string;
  readonly legacySettings?: readonly string[];
  readonly aliases?: readonly string[];
  readonly exchangesRefreshToken?: boolean;
}

/**
 * One authentication flow this simulation runs.
 *
 * A flow knows the `ExplicitAuthFlows` entry that opens it, because which flow
 * a request uses decides what the app client has to be configured for. That is
 * checked before the user is looked at, as real Cognito checks it, so a client
 * created without the flow fails the same way whatever the password was.
 */
export class SimCognitoAuthFlow {
  public readonly name: string;
  public readonly clientSetting: string;

  /**
   * Whether the flow trades a refresh token for new tokens rather than signing
   * a user in with a password.
   */
  public readonly exchangesRefreshToken: boolean;

  private readonly aliases: readonly string[];
  private readonly settings: readonly string[];

  constructor(properties: SimCognitoAuthFlowProperties) {
    this.name = properties.name;
    this.clientSetting = properties.clientSetting;
    this.exchangesRefreshToken = properties.exchangesRefreshToken ?? false;
    this.aliases = properties.aliases ?? [];
    this.settings = [
      properties.clientSetting,
      ...(properties.legacySettings ?? []),
    ];
  }

  /**
   * Whether a requested `AuthFlow` names this flow.
   */
  matches(authFlow: string): boolean {
    return authFlow === this.name || this.aliases.includes(authFlow);
  }

  /**
   * Refuse a flow the app client is not configured for.
   *
   * The legacy `ExplicitAuthFlows` value a flow replaced opens it too, as it
   * does on real Cognito, so a client made before the `ALLOW_` prefixed
   * settings existed still signs users in.
   */
  requireEnabledFor(client: SimCognitoUserPoolClient): void {
    const enabled = this.settings.some((setting) =>
      client.explicitAuthFlows.allows(setting),
    );

    if (enabled) {
      return;
    }

    throw new SimCognitoInvalidParameterException(
      `${this.name} is not enabled for the client ${client.id}: create the ` +
        `app client with ${this.clientSetting} among its ExplicitAuthFlows`,
    );
  }
}
