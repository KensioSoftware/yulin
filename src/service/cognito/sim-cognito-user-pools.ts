import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import { SimCognitoAppClients } from "./sim-cognito-app-clients.js";
import type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

interface SimCognitoUserPoolsProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The pool operations of simulated Cognito: creating a pool, reading and
 * changing its settings, deleting it, and listing the pools a scope holds.
 *
 * They are a class of their own for the reason the rest of the chain is: one
 * class holding every Cognito operation had outgrown reading in one sitting,
 * and `SimCognitoIdentityProvider` above this holds the wiring the whole
 * service is built from.
 */
export abstract class SimCognitoUserPools extends SimCognitoAppClients {
  protected constructor(properties: SimCognitoUserPoolsProperties) {
    super(properties);
  }

  /**
   * Handle a CreateUserPool Command from the SDK.
   */
  async createUserPool(
    command: simCognitoCommands.SimCreateUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateUserPoolCommandOutput> {
    await this.background.sequence();
    return this.commands.userPools.create(command, options);
  }

  /**
   * Handle a DescribeUserPool Command from the SDK.
   */
  async describeUserPool(
    command: simCognitoCommands.SimDescribeUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeUserPoolCommandOutput> {
    await this.background.sequence();
    return this.commands.userPools.describe(command, options);
  }

  /**
   * Handle an UpdateUserPool Command from the SDK.
   */
  async updateUserPool(
    command: simCognitoCommands.SimUpdateUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimUpdateUserPoolCommandOutput> {
    await this.background.sequence();
    return this.commands.userPools.update(command, options);
  }

  /**
   * Handle a DeleteUserPool Command from the SDK.
   */
  async deleteUserPool(
    command: simCognitoCommands.SimDeleteUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteUserPoolCommandOutput> {
    await this.background.sequence();
    return this.commands.userPools.delete(command, options);
  }

  /**
   * Handle a SetUserPoolMfaConfig Command from the SDK.
   *
   * This is the second call real CloudFormation makes when a template declares
   * a pool with MFA, and the only place the factors behind an `MfaConfiguration`
   * are set.
   */
  async setUserPoolMfaConfig(
    command: simCognitoCommands.SimSetUserPoolMfaConfigCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimSetUserPoolMfaConfigCommandOutput> {
    await this.background.sequence();
    return this.commands.userPoolMfa.set(command, options);
  }

  /**
   * Handle a GetUserPoolMfaConfig Command from the SDK.
   */
  async getUserPoolMfaConfig(
    command: simCognitoCommands.SimGetUserPoolMfaConfigCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimGetUserPoolMfaConfigCommandOutput> {
    await this.background.sequence();
    return this.commands.userPoolMfa.get(command, options);
  }

  /**
   * Handle a ListUserPools Command from the SDK.
   */
  async listUserPools(
    command: simCognitoCommands.SimListUserPoolsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUserPoolsCommandOutput> {
    await this.background.sequence();
    return this.commands.listUserPools.handle(command, options);
  }
}
