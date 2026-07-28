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
import { SimCognitoAuthorizer } from "./command/authorize/sim-cognito-authorizer.js";
import { SimCognitoListUserPoolClients } from "./command/client/sim-cognito-list-user-pool-clients.js";
import { SimCognitoUserPoolClientCommands } from "./command/client/sim-cognito-user-pool-client-commands.js";
import type * as simCognitoCommands from "./command/sim-cognito-command.types.js";
import { SimCognitoListUserPools } from "./command/user-pool/sim-cognito-list-user-pools.js";
import { SimCognitoUserPoolCommands } from "./command/user-pool/sim-cognito-user-pool-commands.js";
import { SimCognitoSdkCommandRouter } from "./sdk/sim-cognito-sdk-command-router.js";
import { SimCognitoUserPoolClientFactory } from "./user-pool/client/sim-cognito-user-pool-client-factory.js";
import type { SimCognitoUserPool } from "./user-pool/sim-cognito-user-pool.js";
import { SimCognitoUserPoolFactory } from "./user-pool/sim-cognito-user-pool-factory.js";
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
  private readonly pools: SimCognitoUserPoolStore;
  private readonly userPoolCommands: SimCognitoUserPoolCommands;
  private readonly listUserPoolsCommand: SimCognitoListUserPools;
  private readonly clientCommands: SimCognitoUserPoolClientCommands;
  private readonly listClientsCommand: SimCognitoListUserPoolClients;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimCognitoSdkCommandRouter(this);

  constructor(properties: SimCognitoIdentityProviderProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimCognitoAuthorizer({ iam, accountRegionScope });

    this.background = background;
    this.pools = new SimCognitoUserPoolStore();
    this.userPoolCommands = new SimCognitoUserPoolCommands({
      pools: this.pools,
      poolFactory: new SimCognitoUserPoolFactory({
        accountRegionScope,
        pools: this.pools,
        clock: background,
      }),
      authorizer,
    });
    this.listUserPoolsCommand = new SimCognitoListUserPools({
      pools: this.pools,
      authorizer,
    });
    this.clientCommands = new SimCognitoUserPoolClientCommands({
      pools: this.pools,
      clientFactory: new SimCognitoUserPoolClientFactory({ clock: background }),
      authorizer,
    });
    this.listClientsCommand = new SimCognitoListUserPoolClients({
      pools: this.pools,
      authorizer,
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
    return this.userPoolCommands.create(command, options);
  }

  /**
   * Handle a DescribeUserPool Command from the SDK.
   */
  async describeUserPool(
    command: simCognitoCommands.SimDescribeUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeUserPoolCommandOutput> {
    await this.background.sequence();
    return this.userPoolCommands.describe(command, options);
  }

  /**
   * Handle a DeleteUserPool Command from the SDK.
   */
  async deleteUserPool(
    command: simCognitoCommands.SimDeleteUserPoolCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteUserPoolCommandOutput> {
    await this.background.sequence();
    return this.userPoolCommands.delete(command, options);
  }

  /**
   * Handle a ListUserPools Command from the SDK.
   */
  async listUserPools(
    command: simCognitoCommands.SimListUserPoolsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUserPoolsCommandOutput> {
    await this.background.sequence();
    return this.listUserPoolsCommand.handle(command, options);
  }

  /**
   * Handle a CreateUserPoolClient Command from the SDK.
   */
  async createUserPoolClient(
    command: simCognitoCommands.SimCreateUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimCreateUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.clientCommands.create(command, options);
  }

  /**
   * Handle a DescribeUserPoolClient Command from the SDK.
   */
  async describeUserPoolClient(
    command: simCognitoCommands.SimDescribeUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDescribeUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.clientCommands.describe(command, options);
  }

  /**
   * Handle a DeleteUserPoolClient Command from the SDK.
   */
  async deleteUserPoolClient(
    command: simCognitoCommands.SimDeleteUserPoolClientCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimDeleteUserPoolClientCommandOutput> {
    await this.background.sequence();
    return this.clientCommands.delete(command, options);
  }

  /**
   * Handle a ListUserPoolClients Command from the SDK.
   */
  async listUserPoolClients(
    command: simCognitoCommands.SimListUserPoolClientsCommand,
    options?: SimCognitoIdentityProviderRequestOptions,
  ): Promise<simCognitoCommands.SimListUserPoolClientsCommandOutput> {
    await this.background.sequence();
    return this.listClientsCommand.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
