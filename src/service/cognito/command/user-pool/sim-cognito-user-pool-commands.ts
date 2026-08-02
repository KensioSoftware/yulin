import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoUserPoolFactory } from "../../user-pool/sim-cognito-user-pool-factory.js";
import { requireSimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";
import type { SimCognitoUserPoolStore } from "../../user-pool/sim-cognito-user-pool-store.js";
import type { SimCognitoAuthorizer } from "../authorize/sim-cognito-authorizer.js";
import { SimCognitoUnsimulatedUserPoolOptions } from "./sim-cognito-unsimulated-pool-options.js";
import { SimCognitoUserPoolView } from "./sim-cognito-user-pool-view.js";
import type {
  SimCreateUserPoolCommand,
  SimCreateUserPoolCommandOutput,
  SimDeleteUserPoolCommand,
  SimDeleteUserPoolCommandOutput,
  SimDescribeUserPoolCommand,
  SimDescribeUserPoolCommandOutput,
} from "./user-pool.command.js";

interface SimCognitoUserPoolCommandsProperties {
  readonly pools: SimCognitoUserPoolStore;
  readonly poolFactory: SimCognitoUserPoolFactory;
  readonly authorizer: SimCognitoAuthorizer;
}

interface SimCognitoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that create, describe and delete a simulated user pool.
 */
export class SimCognitoUserPoolCommands {
  private readonly pools: SimCognitoUserPoolStore;
  private readonly poolFactory: SimCognitoUserPoolFactory;
  private readonly authorizer: SimCognitoAuthorizer;
  private readonly view = new SimCognitoUserPoolView();
  private readonly unsimulatedOptions =
    new SimCognitoUnsimulatedUserPoolOptions();

  constructor(properties: SimCognitoUserPoolCommandsProperties) {
    this.pools = properties.pools;
    this.poolFactory = properties.poolFactory;
    this.authorizer = properties.authorizer;
  }

  /**
   * Create a user pool.
   *
   * The pool's id is allocated here rather than asked for, as it is on real
   * Cognito, so nothing can rely on a pool id being predictable.
   */
  create(
    command: SimCreateUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimCreateUserPoolCommandOutput {
    const { input } = command;

    this.authorizer.authorizeAny("cognito-idp:CreateUserPool", options?.caller);
    this.unsimulatedOptions.refuseIn(input);

    const pool = this.poolFactory.make({
      name: input.PoolName,
      policies: input.Policies,
      deletionProtection: input.DeletionProtection,
      unsimulatedSettings: input,
    });

    this.pools.add(pool);

    return { $metadata: {}, UserPool: this.view.describe(pool) };
  }

  /**
   * Describe a user pool's settings.
   */
  describe(
    command: SimDescribeUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimDescribeUserPoolCommandOutput {
    const userPoolId = requireSimCognitoUserPoolId(command.input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:DescribeUserPool",
      userPoolId,
      options?.caller,
    );

    return {
      $metadata: {},
      UserPool: this.view.describe(this.pools.require(userPoolId)),
    };
  }

  /**
   * Delete a user pool, and with it every app client in it.
   */
  delete(
    command: SimDeleteUserPoolCommand,
    options?: SimCognitoCommandOptions,
  ): SimDeleteUserPoolCommandOutput {
    const userPoolId = requireSimCognitoUserPoolId(command.input.UserPoolId);

    this.authorizer.authorizeUserPool(
      "cognito-idp:DeleteUserPool",
      userPoolId,
      options?.caller,
    );

    const pool = this.pools.require(userPoolId);

    if (pool.deletionProtection.isActive) {
      throw new SimCognitoInvalidParameterException(
        `User pool ${userPoolId} is protected against deletion. Real ` +
          `Cognito wants an UpdateUserPool request deactivating the ` +
          `protection first, which this simulation does not support, so ` +
          `create the pool without DeletionProtection instead.`,
      );
    }

    this.pools.remove(pool);

    return { $metadata: {} };
  }
}
