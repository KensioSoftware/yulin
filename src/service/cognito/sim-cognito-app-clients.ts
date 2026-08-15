import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import { SimCognitoFederation } from "./sim-cognito-federation.js";
import type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

interface SimCognitoAppClientsProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The app client operations of simulated Cognito.
 *
 * An app client is who an application is when it talks to a pool, and the pool
 * settings around it are what the pool itself is, so the two are separate
 * classes for the same reason the rest of the chain is: one class holding
 * every Cognito operation had outgrown reading in one sitting.
 */
export abstract class SimCognitoAppClients extends SimCognitoFederation {
  protected constructor(properties: SimCognitoAppClientsProperties) {
    super(properties);
  }

  /**
   * Handle a CreateUserPoolClient Command from the SDK.
   */
  async createUserPoolClient(
    command: simCognitoCommands.SimCreateUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.commands.clients.create(command, options);
  }

  /**
   * Handle a DescribeUserPoolClient Command from the SDK.
   */
  async describeUserPoolClient(
    command: simCognitoCommands.SimDescribeUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.commands.clients.describe(command, options);
  }

  /**
   * Handle an UpdateUserPoolClient Command from the SDK.
   */
  async updateUserPoolClient(
    command: simCognitoCommands.SimUpdateUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimUpdateUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.commands.clients.update(command, options);
  }

  /**
   * Handle a DeleteUserPoolClient Command from the SDK.
   */
  async deleteUserPoolClient(
    command: simCognitoCommands.SimDeleteUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.commands.clients.delete(command, options);
  }

  /**
   * Handle a ListUserPoolClients Command from the SDK.
   */
  async listUserPoolClients(
    command: simCognitoCommands.SimListUserPoolClientsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUserPoolClientsCommandOutput> {
    await this.background.sequence();
    return this.commands.listClients.handle(command, options);
  }
}
