import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import { SimCognitoCommands } from "./command/sim-cognito-commands.js";
import { SimCognitoSdkCommandRouter } from "./sdk/sim-cognito-sdk-command-router.js";
import {
  type SimCognitoIdentityProviderRequestOptions,
  SimCognitoUserDirectory,
} from "./sim-cognito-user-directory.js";

import type { SimCognitoUserPool } from "./user-pool/sim-cognito-user-pool.js";
import type { SimCognitoUserPoolId } from "./user-pool/sim-cognito-user-pool-id.js";
import { SimCognitoUserPoolStore } from "./user-pool/sim-cognito-user-pool-store.js";

export type { SimCognitoIdentityProviderRequestOptions } from "./sim-cognito-user-directory.js";

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
 * The pool and app client operations are here. The user and group operations
 * are on `SimCognitoUserDirectory`, which this extends, so a caller reaches
 * all of them on one service object.
 *
 * Only user pools are simulated. Cognito identity pools, which hand out AWS
 * credentials, are a different service and are not simulated at all.
 */
export class SimCognitoIdentityProvider extends SimCognitoUserDirectory {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly sdkRouter = new SimCognitoSdkCommandRouter(this);

  constructor(properties: SimCognitoIdentityProviderProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;
    const pools = new SimCognitoUserPoolStore();

    super({
      commands: new SimCognitoCommands({
        accountRegionScope,
        iam,
        clock: background,
        pools,
      }),
      background,
    });

    this.pools = pools;
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
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
