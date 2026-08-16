import type { BackgroundScheduler } from "../../util/background/background.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import type { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import {
  SimCognitoUserFactors,
  type SimCognitoIdentityProviderRequestOptions,
} from "./sim-cognito-user-factors.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-authentication.js";

interface SimCognitoUserDirectoryProperties {
  readonly commands: SimCognitoCommands;
  readonly background: BackgroundScheduler;
}

/**
 * The directory half of simulated Cognito: the users in a pool, and the
 * groups they belong to.
 *
 * `SimCognitoIdentityProvider` extends this, which extends
 * `SimCognitoUserFactors`, so a caller reaches every operation on the one
 * service object the way the real API presents them. They are split up because
 * a pool's settings, a pool's contents, the factors a user registers and
 * signing in are separate concerns, and each is long enough to read on its
 * own.
 */
export abstract class SimCognitoUserDirectory extends SimCognitoUserFactors {
  protected constructor(properties: SimCognitoUserDirectoryProperties) {
    super(properties);
  }

  /**
   * Handle an AdminCreateUser Command from the SDK.
   */
  async adminCreateUser(
    command: simCognitoCommands.SimAdminCreateUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminCreateUserCommandOutput> {
    await this.background.sequence();
    return this.commands.users.create(command, options);
  }

  /**
   * Handle a SignUp Command from the SDK.
   */
  async signUp(
    command: simCognitoCommands.SimSignUpCommand,
  ): Promise<simCognitoCommands.SimSignUpCommandOutput> {
    await this.background.sequence();
    return this.commands.signUp.signUp(command);
  }

  /**
   * Handle a ConfirmSignUp Command from the SDK.
   */
  async confirmSignUp(
    command: simCognitoCommands.SimConfirmSignUpCommand,
  ): Promise<simCognitoCommands.SimConfirmSignUpCommandOutput> {
    await this.background.sequence();
    return this.commands.signUp.confirmSignUp(command);
  }

  /**
   * Handle a ResendConfirmationCode Command from the SDK.
   */
  async resendConfirmationCode(
    command: simCognitoCommands.SimResendConfirmationCodeCommand,
  ): Promise<simCognitoCommands.SimResendConfirmationCodeCommandOutput> {
    await this.background.sequence();
    return this.commands.signUp.resendConfirmationCode(command);
  }

  /**
   * Handle an AdminConfirmSignUp Command from the SDK.
   */
  async adminConfirmSignUp(
    command: simCognitoCommands.SimAdminConfirmSignUpCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminConfirmSignUpCommandOutput> {
    await this.background.sequence();
    return this.commands.signUp.adminConfirmSignUp(command, options);
  }

  /**
   * Handle an AdminGetUser Command from the SDK.
   */
  async adminGetUser(
    command: simCognitoCommands.SimAdminGetUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminGetUserCommandOutput> {
    await this.background.sequence();
    return this.commands.users.get(command, options);
  }

  /**
   * Handle an AdminDeleteUser Command from the SDK.
   */
  async adminDeleteUser(
    command: simCognitoCommands.SimAdminDeleteUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminDeleteUserCommandOutput> {
    await this.background.sequence();
    return this.commands.users.delete(command, options);
  }

  /**
   * Handle an AdminSetUserPassword Command from the SDK.
   */
  async adminSetUserPassword(
    command: simCognitoCommands.SimAdminSetUserPasswordCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminSetUserPasswordCommandOutput> {
    await this.background.sequence();
    return this.commands.userUpdates.setPassword(command, options);
  }

  /**
   * Handle an AdminUpdateUserAttributes Command from the SDK.
   */
  async adminUpdateUserAttributes(
    command: simCognitoCommands.SimAdminUpdateUserAttributesCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminUpdateUserAttributesCommandOutput> {
    await this.background.sequence();
    return this.commands.userUpdates.updateAttributes(command, options);
  }

  /**
   * Handle an AdminDisableUser Command from the SDK.
   */
  async adminDisableUser(
    command: simCognitoCommands.SimAdminDisableUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminDisableUserCommandOutput> {
    await this.background.sequence();
    return this.commands.userUpdates.disable(command, options);
  }

  /**
   * Handle an AdminEnableUser Command from the SDK.
   */
  async adminEnableUser(
    command: simCognitoCommands.SimAdminEnableUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminEnableUserCommandOutput> {
    await this.background.sequence();
    return this.commands.userUpdates.enable(command, options);
  }

  /**
   * Handle a ListUsers Command from the SDK.
   */
  async listUsers(
    command: simCognitoCommands.SimListUsersCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUsersCommandOutput> {
    await this.background.sequence();
    return this.commands.listUsers.handle(command, options);
  }

  /**
   * Handle a CreateGroup Command from the SDK.
   */
  async createGroup(
    command: simCognitoCommands.SimCreateGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groups.create(command, options);
  }

  /**
   * Handle a GetGroup Command from the SDK.
   */
  async getGroup(
    command: simCognitoCommands.SimGetGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimGetGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groups.get(command, options);
  }

  /**
   * Handle an UpdateGroup Command from the SDK.
   */
  async updateGroup(
    command: simCognitoCommands.SimUpdateGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimUpdateGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groups.update(command, options);
  }

  /**
   * Handle a DeleteGroup Command from the SDK.
   */
  async deleteGroup(
    command: simCognitoCommands.SimDeleteGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groups.delete(command, options);
  }

  /**
   * Handle a ListGroups Command from the SDK.
   */
  async listGroups(
    command: simCognitoCommands.SimListGroupsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListGroupsCommandOutput> {
    await this.background.sequence();
    return this.commands.listGroups.handle(command, options);
  }

  /**
   * Handle an AdminAddUserToGroup Command from the SDK.
   */
  async adminAddUserToGroup(
    command: simCognitoCommands.SimAdminAddUserToGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminAddUserToGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groupMembership.addUserToGroup(command, options);
  }

  /**
   * Handle an AdminRemoveUserFromGroup Command from the SDK.
   */
  async adminRemoveUserFromGroup(
    command: simCognitoCommands.SimAdminRemoveUserFromGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminRemoveUserFromGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groupMembership.removeUserFromGroup(command, options);
  }

  /**
   * Handle an AdminListGroupsForUser Command from the SDK.
   */
  async adminListGroupsForUser(
    command: simCognitoCommands.SimAdminListGroupsForUserCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimAdminListGroupsForUserCommandOutput> {
    await this.background.sequence();
    return this.commands.groupMembership.listGroupsForUser(command, options);
  }

  /**
   * Handle a ListUsersInGroup Command from the SDK.
   */
  async listUsersInGroup(
    command: simCognitoCommands.SimListUsersInGroupCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUsersInGroupCommandOutput> {
    await this.background.sequence();
    return this.commands.groupMembership.listUsersInGroup(command, options);
  }
}
