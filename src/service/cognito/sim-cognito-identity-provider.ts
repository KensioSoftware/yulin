import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import { SimCognitoSdkCommandRouter } from "./sdk/sim-cognito-sdk-command-router.js";
import type { SimCognitoUserPool } from "./user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolId } from "./user-pool/sim-cognito-user-pool-id.js";
import { SimCognitoUserPoolStore } from "./user-pool/sim-cognito-user-pool-store.js";

export interface SimCognitoIdentityProviderRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimCognitoIdentityProviderProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Cognito user pools. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Pools are scoped to an account and region, as they are on real AWS: a pool
 * id names the region it was created in, and an app client id is only
 * meaningful inside its pool.
 *
 * Only user pools are simulated. Cognito identity pools, which hand out AWS
 * credentials, are a different service and are not simulated at all.
 */
export class SimCognitoIdentityProvider {
  private readonly pools = new SimCognitoUserPoolStore();
  private readonly commands: SimCognitoCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimCognitoSdkCommandRouter(this);

  constructor(properties: SimCognitoIdentityProviderProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    this.background = background;
    this.commands = new SimCognitoCommands({
      accountRegionScope,
      iam,
      clock: background,
      pools: this.pools,
    });
  }

  /**
   * Find a user pool by id.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * pool state without going through a Command and its authorization.
   */
  findUserPool(userPoolId: string): SimCognitoUserPool | undefined {
    return this.pools.find(userPoolId as SimCognitoUserPoolId);
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
   * Handle a ListUserPools Command from the SDK.
   */
  async listUserPools(
    command: simCognitoCommands.SimListUserPoolsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUserPoolsCommandOutput> {
    await this.background.sequence();
    return this.commands.listUserPools.handle(command, options);
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
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
