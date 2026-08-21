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
 * The passkey operations are here for the same reason: a passkey is
 * registered by the user it belongs to, from a session that already exists,
 * and the access token is the whole of the authorization.
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
   * Handle a StartWebAuthnRegistration Command from the SDK.
   *
   * The options this answers with are what a browser passes to
   * `navigator.credentials.create()`. A test with no browser reads the
   * credential its own authenticator would have made off the pool, through
   * `SimCognitoUserPool.webAuthnCredential`.
   */
  async startWebAuthnRegistration(
    command: simCognitoCommands.SimStartWebAuthnRegistrationCommand,
  ): Promise<simCognitoCommands.SimStartWebAuthnRegistrationCommandOutput> {
    await this.background.sequence();
    return this.commands.webAuthn.startWebAuthnRegistration(command);
  }

  /**
   * Handle a CompleteWebAuthnRegistration Command from the SDK.
   */
  async completeWebAuthnRegistration(
    command: simCognitoCommands.SimCompleteWebAuthnRegistrationCommand,
  ): Promise<simCognitoCommands.SimCompleteWebAuthnRegistrationCommandOutput> {
    await this.background.sequence();
    return this.commands.webAuthn.completeWebAuthnRegistration(command);
  }

  /**
   * Handle a ListWebAuthnCredentials Command from the SDK.
   */
  async listWebAuthnCredentials(
    command: simCognitoCommands.SimListWebAuthnCredentialsCommand,
  ): Promise<simCognitoCommands.SimListWebAuthnCredentialsCommandOutput> {
    await this.background.sequence();
    return this.commands.webAuthn.listWebAuthnCredentials(command);
  }

  /**
   * Handle a DeleteWebAuthnCredential Command from the SDK.
   */
  async deleteWebAuthnCredential(
    command: simCognitoCommands.SimDeleteWebAuthnCredentialCommand,
  ): Promise<simCognitoCommands.SimDeleteWebAuthnCredentialCommandOutput> {
    await this.background.sequence();
    return this.commands.webAuthn.deleteWebAuthnCredential(command);
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
