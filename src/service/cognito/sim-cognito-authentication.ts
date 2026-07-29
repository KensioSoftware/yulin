import type { BackgroundScheduler } from "../../util/background/background.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";

export interface SimCognitoIdentityProviderRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimCognitoAuthenticationProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The sign-in half of simulated Cognito: starting an authentication, answering
 * a challenge, and signing out.
 *
 * The admin operations and the client ones are both here, because an
 * application usually uses one or the other and a caller reaches them on the
 * one service object either way. They differ in authorization:
 * `AdminInitiateAuth`, `AdminRespondToAuthChallenge` and
 * `AdminUserGlobalSignOut` authorize an IAM action against the pool, and
 * `InitiateAuth`, `RespondToAuthChallenge` and `GlobalSignOut` authorize
 * nothing at all, as real Cognito evaluates no IAM policy for them.
 */
export abstract class SimCognitoAuthentication {
  protected readonly commands: SimCognitoCommands;
  protected readonly background: BackgroundScheduler;

  protected constructor(properties: SimCognitoAuthenticationProperties) {
    this.commands = properties.commands;
    this.background = properties.background;
  }

  /**
   * Handle an AdminInitiateAuth Command from the SDK.
   */
  async adminInitiateAuth(
    command: simCognitoCommands.SimAdminInitiateAuthCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminInitiateAuthCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.adminInitiateAuth.handle(command, options);
  }

  /**
   * Handle an AdminRespondToAuthChallenge Command from the SDK.
   */
  async adminRespondToAuthChallenge(
    command: simCognitoCommands.SimAdminRespondToAuthChallengeCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminRespondToAuthChallengeCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.adminRespondToChallenge.handle(command, options);
  }

  /**
   * Handle an InitiateAuth Command from the SDK.
   *
   * No caller is read, because real Cognito authorizes this operation with no
   * IAM policy at all.
   */
  async initiateAuth(
    command: simCognitoCommands.SimInitiateAuthCommand,
  ): Promise<simCognitoCommands.SimInitiateAuthCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.initiateAuth.handle(command);
  }

  /**
   * Handle a RespondToAuthChallenge Command from the SDK.
   */
  async respondToAuthChallenge(
    command: simCognitoCommands.SimRespondToAuthChallengeCommand,
  ): Promise<simCognitoCommands.SimRespondToAuthChallengeCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.respondToChallenge.handle(command);
  }

  /**
   * Handle a GlobalSignOut Command from the SDK.
   *
   * The access token is what authorizes this, as it does on real Cognito.
   */
  async globalSignOut(
    command: simCognitoCommands.SimGlobalSignOutCommand,
  ): Promise<simCognitoCommands.SimGlobalSignOutCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.signOut.globalSignOut(command);
  }

  /**
   * Handle an AdminUserGlobalSignOut Command from the SDK.
   */
  async adminUserGlobalSignOut(
    command: simCognitoCommands.SimAdminUserGlobalSignOutCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminUserGlobalSignOutCommandOutput> {
    await this.background.sequence();
    return this.commands.auth.signOut.adminUserGlobalSignOut(command, options);
  }
}
