import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import {
  SimCognitoAuthentication,
  type SimCognitoIdentityProviderRequestOptions,
} from "./sim-cognito-authentication.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-authentication.js";

interface SimCognitoUserFactorsProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The self-service half of simulated Cognito: a signed-in user reading itself,
 * and the second factors it registers.
 *
 * All but one of these are authorized by the user's own access token and
 * evaluate no IAM policy, as real Cognito evaluates none for them.
 * `AdminSetUserMFAPreference` is the administrative one, and authorizes
 * against the pool like every other admin operation.
 *
 * `SimCognitoUserDirectory` extends this, which extends
 * `SimCognitoAuthentication`.
 */
export abstract class SimCognitoUserFactors extends SimCognitoAuthentication {
  protected constructor(properties: SimCognitoUserFactorsProperties) {
    super(properties);
  }

  /**
   * Handle a GetUser Command from the SDK.
   *
   * The access token is what authorizes this, as it does on real Cognito.
   */
  async getUser(
    command: simCognitoCommands.SimGetUserCommand,
  ): Promise<simCognitoCommands.SimGetUserCommandOutput> {
    await this.background.sequence();
    return this.commands.users.getUser(command);
  }

  /**
   * Handle an AssociateSoftwareToken Command from the SDK.
   */
  async associateSoftwareToken(
    command: simCognitoCommands.SimAssociateSoftwareTokenCommand,
  ): Promise<simCognitoCommands.SimAssociateSoftwareTokenCommandOutput> {
    await this.background.sequence();
    return this.commands.userMfa.associateSoftwareToken(command);
  }

  /**
   * Handle a VerifySoftwareToken Command from the SDK.
   */
  async verifySoftwareToken(
    command: simCognitoCommands.SimVerifySoftwareTokenCommand,
  ): Promise<simCognitoCommands.SimVerifySoftwareTokenCommandOutput> {
    await this.background.sequence();
    return this.commands.userMfa.verifySoftwareToken(command);
  }

  /**
   * Handle a SetUserMFAPreference Command from the SDK.
   */
  async setUserMFAPreference(
    command: simCognitoCommands.SimSetUserMFAPreferenceCommand,
  ): Promise<simCognitoCommands.SimSetUserMFAPreferenceCommandOutput> {
    await this.background.sequence();
    return this.commands.userMfa.setUserMfaPreference(command);
  }

  /**
   * Handle an AdminSetUserMFAPreference Command from the SDK.
   */
  async adminSetUserMFAPreference(
    command: simCognitoCommands.SimAdminSetUserMFAPreferenceCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminSetUserMFAPreferenceCommandOutput> {
    await this.background.sequence();
    return this.commands.userMfa.adminSetUserMfaPreference(command, options);
  }
}
